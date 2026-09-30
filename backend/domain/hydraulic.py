from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any, Iterable, Mapping, Optional


class HydraulicCalculationError(ValueError):
    """Error base para cálculos hidráulicos inválidos."""


class HydraulicInputError(HydraulicCalculationError):
    """Error producido por datos de entrada inválidos."""


@dataclass(frozen=True)
class HydraulicComponent:
    """
    Componente hidráulico utilizado para representar una pérdida localizada.

    k_value:
        Coeficiente de pérdida localizada.
    equivalent_length_m:
        Longitud equivalente en metros.
    fixed_loss_mca:
        Pérdida fija expresada en metros de columna de agua.
    """

    name: str
    k_value: Optional[float] = None
    equivalent_length_m: Optional[float] = None
    fixed_loss_mca: Optional[float] = None

    def validate(self) -> None:
        """
        Valida los parámetros hidráulicos del componente.

        Si alguno de los valores proporcionados es NaN o infinito,
        devuelve el error de dominio correspondiente.
        """
        values = (
            ("k_value", self.k_value),
            ("equivalent_length_m", self.equivalent_length_m),
            ("fixed_loss_mca", self.fixed_loss_mca),
        )

        for field_name, value in values:
            if value is not None and not isfinite(float(value)):
                raise HydraulicInputError(
                    f"component.value_not_finite: {field_name}"
                )

        if self.k_value is not None and self.k_value < 0:
            raise HydraulicInputError(
                "component.k_value_invalid: k_value no puede ser negativo"
            )

        if self.equivalent_length_m is not None and self.equivalent_length_m < 0:
            raise HydraulicInputError(
                "component.equivalent_length_invalid: "
                "equivalent_length_m no puede ser negativo"
            )

        if self.fixed_loss_mca is not None and self.fixed_loss_mca < 0:
            raise HydraulicInputError(
                "component.fixed_loss_invalid: "
                "fixed_loss_mca no puede ser negativo"
            )


@dataclass(frozen=True)
class HydraulicEndpoint:
    """
    Punto final de un sector hidráulico.

    sector_id:
        Identificador del sector al que pertenece el endpoint.
    pressure_required_mca:
        Presión mínima requerida en el punto final.
    flow_lpm:
        Caudal requerido por el endpoint.
    """

    sector_id: str
    pressure_required_mca: float = 0.0
    flow_lpm: float = 0.0

    def validate(self) -> None:
        if not self.sector_id:
            raise HydraulicInputError("endpoint.sector_unknown")

        values = (
            ("pressure_required_mca", self.pressure_required_mca),
            ("flow_lpm", self.flow_lpm),
        )

        for field_name, value in values:
            if not isfinite(float(value)):
                raise HydraulicInputError(
                    f"endpoint.value_not_finite: {field_name}"
                )

        if self.pressure_required_mca < 0:
            raise HydraulicInputError(
                "endpoint.pressure_invalid"
            )

        if self.flow_lpm < 0:
            raise HydraulicInputError(
                "endpoint.flow_invalid"
            )


@dataclass(frozen=True)
class SectorCalculationResult:
    """
    Resultado del cálculo hidráulico de un sector.

    Todos los valores contenidos en este resultado proceden de los
    parámetros suministrados al cálculo. No se introducen datos físicos
    inventados cuando un parámetro necesario no está disponible.
    """

    sector_id: str
    flow_lpm: float
    head_loss_mca: float
    required_pressure_mca: float
    available_pressure_mca: Optional[float]
    pressure_margin_mca: Optional[float]
    minimum_pressure_mca: Optional[float]
    pump_head_mca: Optional[float]
    satisfied: Optional[bool]
    phase: int = 1


def _finite_or_error(
    value: Optional[float],
    field_name: str,
) -> Optional[float]:
    """
    Convierte un valor a float y comprueba que sea finito.
    """
    if value is None:
        return None

    numeric_value = float(value)

    if not isfinite(numeric_value):
        raise HydraulicInputError(
            f"{field_name}.value_not_finite"
        )

    return numeric_value


def _positive_or_zero(
    value: Optional[float],
    field_name: str,
) -> Optional[float]:
    numeric_value = _finite_or_error(value, field_name)

    if numeric_value is not None and numeric_value < 0:
        raise HydraulicInputError(
            f"{field_name}.invalid"
        )

    return numeric_value


def validate_endpoint(
    endpoint: HydraulicEndpoint | Mapping[str, Any],
) -> HydraulicEndpoint:
    """
    Valida y normaliza un endpoint.

    Un endpoint sin sector_id produce exactamente el error de dominio
    endpoint.sector_unknown.
    """
    if isinstance(endpoint, HydraulicEndpoint):
        normalized = endpoint
    else:
        sector_id = endpoint.get("sector_id")

        if not sector_id:
            raise HydraulicInputError("endpoint.sector_unknown")

        normalized = HydraulicEndpoint(
            sector_id=str(sector_id),
            pressure_required_mca=float(
                endpoint.get("pressure_required_mca", 0.0)
            ),
            flow_lpm=float(endpoint.get("flow_lpm", 0.0)),
        )

    normalized.validate()
    return normalized


def validate_component(
    component: HydraulicComponent | Mapping[str, Any],
) -> HydraulicComponent:
    """
    Valida y normaliza un componente hidráulico.
    """
    if isinstance(component, HydraulicComponent):
        normalized = component
    else:
        normalized = HydraulicComponent(
            name=str(component.get("name", "component")),
            k_value=component.get("k_value"),
            equivalent_length_m=component.get("equivalent_length_m"),
            fixed_loss_mca=component.get("fixed_loss_mca"),
        )

    normalized.validate()
    return normalized


def pressure_margin_mca(
    available_pressure_mca: Optional[float],
    required_pressure_mca: float,
) -> Optional[float]:
    """
    Calcula el margen de presión.

    Si no existe presión disponible, no se inventa un valor:
    se devuelve None.
    """
    available = _finite_or_error(
        available_pressure_mca,
        "available_pressure_mca",
    )

    required = _finite_or_error(
        required_pressure_mca,
        "required_pressure_mca",
    )

    if required is None:
        raise HydraulicInputError(
            "required_pressure_mca.missing"
        )

    if available is None:
        return None

    return available - required

def calculate_hazen_williams_head_loss(
    length_m: float,
    flow_m3s: float,
    diameter_m: float,
    hazen_williams_c: float,
) -> float:
    """
    Calcula la pérdida de carga por fricción mediante Hazen-Williams.

    Unidades:
    - length_m: metros
    - flow_m3s: m³/s
    - diameter_m: metros
    - hazen_williams_c: coeficiente C de Hazen-Williams

    Devuelve:
    - pérdida de carga en metros de columna de agua.

    La ecuación SI utilizada es:

        hf = 10.67 * L * Q^1.852 /
             (C^1.852 * D^4.87)

    Esta función está destinada a agua en tuberías presurizadas.
    """

    length = _positive_or_zero(length_m, "length_m")
    flow = _positive_or_zero(flow_m3s, "flow_m3s")
    diameter = _positive_or_zero(diameter_m, "diameter_m")
    coefficient = _positive_or_zero(
        hazen_williams_c,
        "hazen_williams_c",
    )

    if length is None:
        length = 0.0

    if flow is None:
        flow = 0.0

    if diameter is None or diameter <= 0:
        raise HydraulicInputError(
            "diameter_m.invalid"
        )

    if coefficient is None or coefficient <= 0:
        raise HydraulicInputError(
            "hazen_williams_c.invalid"
        )

    if length == 0.0 or flow == 0.0:
        return 0.0

    head_loss = (
        10.67
        * length
        * flow ** 1.852
        / (
            coefficient ** 1.852
            * diameter ** 4.87
        )
    )

    if not isfinite(head_loss):
        raise HydraulicInputError(
            "head_loss.value_not_finite"
        )

    return head_loss


def calculate_total_head_mca(
    static_head_m: float,
    required_pressure_mca: float,
    friction_loss_mca: float = 0.0,
    fixed_losses_mca: float = 0.0,
) -> float:
    """
    Calcula la altura manométrica total de diseño.

    HMT = desnivel + presión requerida + pérdidas.

    Todos los valores se expresan en m.c.a.
    """

    static_head = _positive_or_zero(
        static_head_m,
        "static_head_m",
    )

    required_pressure = _positive_or_zero(
        required_pressure_mca,
        "required_pressure_mca",
    )

    friction_loss = _positive_or_zero(
        friction_loss_mca,
        "friction_loss_mca",
    )

    fixed_losses = _positive_or_zero(
        fixed_losses_mca,
        "fixed_losses_mca",
    )

    return (
        (static_head or 0.0)
        + (required_pressure or 0.0)
        + (friction_loss or 0.0)
        + (fixed_losses or 0.0)
    )


def calculate_hydraulic_power_w(
    flow_m3s: float,
    head_mca: float,
    *,
    water_density_kg_m3: float = 1000.0,
    gravity_m_s2: float = 9.81,
) -> float:
    """
    Calcula la potencia hidráulica teórica en vatios.

    P = rho * g * Q * H
    """

    flow = _positive_or_zero(
        flow_m3s,
        "flow_m3s",
    )

    head = _positive_or_zero(
        head_mca,
        "head_mca",
    )

    density = _positive_or_zero(
        water_density_kg_m3,
        "water_density_kg_m3",
    )

    gravity = _positive_or_zero(
        gravity_m_s2,
        "gravity_m_s2",
    )

    power = (
        (density or 0.0)
        * (gravity or 0.0)
        * (flow or 0.0)
        * (head or 0.0)
    )

    if not isfinite(power):
        raise HydraulicInputError(
            "hydraulic_power.value_not_finite"
        )

    return power


def calculate_electrical_power_w(
    hydraulic_power_w: float,
    efficiency: float,
) -> float:
    """
    Calcula la potencia eléctrica estimada a partir de la potencia
    hidráulica y del rendimiento global.

    efficiency debe expresarse como valor decimal:
    0.55 = 55 %.
    """

    hydraulic_power = _positive_or_zero(
        hydraulic_power_w,
        "hydraulic_power_w",
    )

    normalized_efficiency = _finite_or_error(
        efficiency,
        "efficiency",
    )

    if normalized_efficiency is None or not 0 < normalized_efficiency <= 1:
        raise HydraulicInputError(
            "efficiency.invalid"
        )

    electrical_power = (
        (hydraulic_power or 0.0)
        / normalized_efficiency
    )

    if not isfinite(electrical_power):
        raise HydraulicInputError(
            "electrical_power.value_not_finite"
        )

    return electrical_power

def calculate_sector(
    endpoint: HydraulicEndpoint | Mapping[str, Any],
    *,
    head_loss_mca: float = 0.0,
    available_pressure_mca: Optional[float] = None,
    minimum_pressure_mca: Optional[float] = None,
    pump_head_mca: Optional[float] = None,
    phase: int = 1,
) -> SectorCalculationResult:
    """
    Calcula el resultado hidráulico de un sector.

    IMPORTANTE:
    - minimum_pressure_mca puede ser None.
    - pump_head_mca puede ser None en Fase 1.
    - No se selecciona ninguna bomba automáticamente en Fase 1.
    - Si faltan datos necesarios para determinar una presión disponible,
      se conserva None en lugar de inventar un valor.
    """
    normalized_endpoint = validate_endpoint(endpoint)

    normalized_head_loss = _positive_or_zero(
        head_loss_mca,
        "head_loss_mca",
    )

    if normalized_head_loss is None:
        normalized_head_loss = 0.0

    normalized_minimum_pressure = _positive_or_zero(
        minimum_pressure_mca,
        "minimum_pressure_mca",
    )

    normalized_pump_head = _finite_or_error(
        pump_head_mca,
        "pump_head_mca",
    )

    normalized_available_pressure = _finite_or_error(
        available_pressure_mca,
        "available_pressure_mca",
    )

    required_pressure = max(
        normalized_endpoint.pressure_required_mca,
        normalized_minimum_pressure
        if normalized_minimum_pressure is not None
        else 0.0,
    )

    if normalized_available_pressure is None:
        calculated_available_pressure = None
    else:
        calculated_available_pressure = (
            normalized_available_pressure - normalized_head_loss
        )

    margin = pressure_margin_mca(
        calculated_available_pressure,
        required_pressure,
    )

    satisfied = None if margin is None else margin >= 0.0

    return SectorCalculationResult(
        sector_id=normalized_endpoint.sector_id,
        flow_lpm=normalized_endpoint.flow_lpm,
        head_loss_mca=normalized_head_loss,
        required_pressure_mca=required_pressure,
        available_pressure_mca=calculated_available_pressure,
        pressure_margin_mca=margin,
        minimum_pressure_mca=normalized_minimum_pressure,
        pump_head_mca=normalized_pump_head,
        satisfied=satisfied,
        phase=phase,
    )


def calculate_total_flow(
    endpoints: Iterable[HydraulicEndpoint | Mapping[str, Any]],
) -> float:
    """
    Suma los caudales de los endpoints.

    Solo utiliza los valores realmente proporcionados.
    """
    total = 0.0

    for endpoint in endpoints:
        normalized = validate_endpoint(endpoint)
        total += normalized.flow_lpm

    if not isfinite(total):
        raise HydraulicInputError(
            "flow.value_not_finite"
        )

    return total


def validate_sector_endpoints(
    endpoints: Iterable[HydraulicEndpoint | Mapping[str, Any]],
    sector_id: str,
) -> list[HydraulicEndpoint]:
    """
    Comprueba que todos los endpoints activos pertenecen al sector indicado.

    Un endpoint inexistente o sin sector válido produce
    endpoint.sector_unknown.
    """
    if not sector_id:
        raise HydraulicInputError("endpoint.sector_unknown")

    validated: list[HydraulicEndpoint] = []

    for endpoint in endpoints:
        normalized = validate_endpoint(endpoint)

        if normalized.sector_id != sector_id:
            raise HydraulicInputError(
                "endpoint.sector_unknown"
            )

        validated.append(normalized)

    return validated


def validate_component_values(
    components: Iterable[
        HydraulicComponent | Mapping[str, Any]
    ],
) -> list[HydraulicComponent]:
    """
    Valida todos los componentes hidráulicos.

    En particular, k_value, equivalent_length_m y fixed_loss_mca
    nunca pueden contener NaN o infinitos.
    """
    validated: list[HydraulicComponent] = []

    for component in components:
        validated.append(validate_component(component))

    return validated