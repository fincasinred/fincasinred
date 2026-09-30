from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from math import isfinite
from typing import Any, Iterable, Mapping, Optional, Sequence

from backend.domain.hydraulic import (
    HydraulicInputError,
    SectorCalculationResult,
)


class PumpRequirementProvenance(str, Enum):
    """Procedencia de las magnitudes críticas del requisito de bombeo."""

    USER_PROVIDED = "USER_PROVIDED"
    MEASURED = "MEASURED"
    CALCULATED = "CALCULATED"
    AUTOMATIC = "AUTOMATIC"
    ESTIMATED = "ESTIMATED"


class PumpRequirementStatus(str, Enum):
    """Estado de validación del requisito de bombeo."""

    VALIDATED = "VALIDATED"
    PROVISIONAL = "PROVISIONAL"
    PENDING = "PENDING"
    BLOCKED = "BLOCKED"
    INVALID = "INVALID"


@dataclass(frozen=True)
class PumpRequirement:
    """
    Contrato mínimo y trazable de requisito de bombeo.

    Mantiene una separación estricta con SectorCalculationResult y con
    cualquier objeto posterior de curva o compatibilidad de bomba.

    Campos principales del caso de uso:
    - sector_id
    - scenarios relevantes como colección de referencias
    - design_flow_lpm
    - required_hmt_mca
    - required_pressure_mca
    - available_pressure_mca
    - pressure_margin_mca
    - pump_required

    Campos de contexto maestro 12.201–12.210 no calculados:
    - critical_point_id
    - hydraulic_path_id
    - distributed_losses_mca
    - local_losses_mca
    - source_system_restrictions
    - provenance/status/version
    """

    sector_id: str
    scenarios: Optional[Sequence[str]] = None
    scenario_id: Optional[str] = None
    design_flow_lpm: float = 0.0
    required_hmt_mca: Optional[float] = None
    required_pressure_mca: float = 0.0
    available_pressure_mca: Optional[float] = None
    pressure_margin_mca: Optional[float] = None
    pump_required: Optional[bool] = None
    critical_point_id: Optional[str] = None
    hydraulic_path_id: Optional[str] = None
    distributed_losses_mca: Optional[float] = None
    local_losses_mca: Optional[float] = None
    source_system_restrictions: Optional[Mapping[str, str]] = None
    split_source_system_restrictions: Optional[Mapping[str, str]] = None
    provenance: Optional[PumpRequirementProvenance] = None
    status: Optional[PumpRequirementStatus] = None
    value_version: Optional[str] = None

    def __post_init__(self) -> None:
        """Compatibilidad de obsolescencia: admite `scenario_id` y armoniza
        la estructura de colección `scenarios` sin tocar la lógica hidráulica.
        """
        if self.scenario_id is not None:
            if not isinstance(self.scenario_id, str) or not self.scenario_id:
                raise HydraulicInputError("pump.scenario_ref_invalid")

            if self.scenarios is None:
                object.__setattr__(self, "scenarios", [self.scenario_id])
            elif isinstance(self.scenarios, Sequence) and not isinstance(
                self.scenarios,
                (str, bytes),
            ):
                existing = list(self.scenarios)
                if self.scenario_id not in existing:
                    existing.append(self.scenario_id)
                object.__setattr__(self, "scenarios", existing)

    def validate(self) -> None:
        """
        Valida el contrato PumpRequirement sin ampliar el motor hidráulico.
        """
        if not self.sector_id:
            raise HydraulicInputError("pump.sector_unknown")

        if self.scenario_id is not None:
            if not isinstance(self.scenario_id, str) or not self.scenario_id:
                raise HydraulicInputError("pump.scenario_ref_invalid")

        if self.scenarios is not None:
            if isinstance(self.scenarios, (str, bytes)):
                raise HydraulicInputError("pump.scenarios_invalid")

            if not isinstance(self.scenarios, Sequence):
                raise HydraulicInputError("pump.scenarios_invalid")

            for scenario_id in self.scenarios:
                if not isinstance(scenario_id, str) or not scenario_id:
                    raise HydraulicInputError("pump.scenario_ref_invalid")

        if self.split_source_system_restrictions is not None:
            if not isinstance(self.split_source_system_restrictions, Mapping):
                raise HydraulicInputError("pump.restrictions_invalid")

            for key, value in self.split_source_system_restrictions.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    raise HydraulicInputError("pump.restrictions_invalid")

        if not isfinite(float(self.design_flow_lpm)):
            raise HydraulicInputError("pump.design_flow_not_finite")

        if self.design_flow_lpm < 0:
            raise HydraulicInputError("pump.design_flow_invalid")

        if not isfinite(float(self.required_pressure_mca)):
            raise HydraulicInputError("pump.required_pressure_not_finite")

        if self.required_pressure_mca < 0:
            raise HydraulicInputError("pump.required_pressure_invalid")

        if self.required_hmt_mca is not None:
            if not isfinite(float(self.required_hmt_mca)):
                raise HydraulicInputError("pump.required_hmt_not_finite")

            if self.required_hmt_mca < 0:
                raise HydraulicInputError("pump.required_hmt_invalid")

        if self.available_pressure_mca is not None:
            if not isfinite(float(self.available_pressure_mca)):
                raise HydraulicInputError("pump.available_pressure_not_finite")

            if self.available_pressure_mca < 0:
                raise HydraulicInputError("pump.available_pressure_invalid")

        if self.pressure_margin_mca is not None:
            if not isfinite(float(self.pressure_margin_mca)):
                raise HydraulicInputError("pump.pressure_margin_not_finite")

        if self.critical_point_id is not None and not isinstance(
            self.critical_point_id,
            str,
        ):
            raise HydraulicInputError("pump.critical_point_id_invalid")

        if self.hydraulic_path_id is not None and not isinstance(
            self.hydraulic_path_id,
            str,
        ):
            raise HydraulicInputError("pump.hydraulic_path_id_invalid")

        if self.distributed_losses_mca is not None:
            if not isfinite(float(self.distributed_losses_mca)):
                raise HydraulicInputError("pump.distributed_losses_not_finite")
            if self.distributed_losses_mca < 0:
                raise HydraulicInputError("pump.distributed_losses_invalid")

        if self.local_losses_mca is not None:
            if not isfinite(float(self.local_losses_mca)):
                raise HydraulicInputError("pump.local_losses_not_finite")
            if self.local_losses_mca < 0:
                raise HydraulicInputError("pump.local_losses_invalid")

        if self.source_system_restrictions is not None:
            if not isinstance(self.source_system_restrictions, Mapping):
                raise HydraulicInputError("pump.restrictions_invalid")

            for key, value in self.source_system_restrictions.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    raise HydraulicInputError("pump.restrictions_invalid")

        if self.split_source_system_restrictions is not None:
            if not isinstance(self.split_source_system_restrictions, Mapping):
                raise HydraulicInputError("pump.restrictions_invalid")

            for key, value in self.split_source_system_restrictions.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    raise HydraulicInputError("pump.restrictions_invalid")

        if self.provenance is not None and not isinstance(
            self.provenance,
            PumpRequirementProvenance,
        ):
            raise HydraulicInputError("pump.provenance_invalid")

        if self.status is not None and not isinstance(
            self.status,
            PumpRequirementStatus,
        ):
            raise HydraulicInputError("pump.status_invalid")

        if self.value_version is not None and not isinstance(self.value_version, str):
            raise HydraulicInputError("pump.value_version_invalid")

        if self.pump_required is not None and not isinstance(
            self.pump_required,
            bool,
        ):
            raise HydraulicInputError("pump.pump_required_invalid")

        if (
            self.available_pressure_mca is not None
            and self.pressure_margin_mca is not None
        ):
            expected_margin = (
                self.available_pressure_mca - self.required_pressure_mca
            )
            if abs(float(self.pressure_margin_mca) - expected_margin) > 1e-9:
                raise HydraulicInputError("pump.pressure_margin_incoherent")


def _normalize_optional_mapping(
    value: Optional[Mapping[str, str]],
) -> Optional[Mapping[str, str]]:
    if value is None:
        return None
    return {str(key): str(item) for key, item in value.items()}


def validate_pump_requirement(
    requirement: PumpRequirement | Mapping[str, Any],
) -> PumpRequirement:
    """
    Valida y normaliza un PumpRequirement mínimo con soporte de contexto
    del bloque maestro 12.201–12.210, sin incorporar curva ni compatibilidad.
    """
    if isinstance(requirement, PumpRequirement):
        normalized = requirement
    else:
        scenario_id = requirement.get("scenario_id")
        scenarios = requirement.get("scenarios")
        if scenario_id is not None and scenarios is None:
            scenarios = [str(scenario_id)]
        elif scenario_id is not None and scenarios is not None:
            candidate = list(scenarios)
            if str(scenario_id) not in candidate:
                candidate.append(str(scenario_id))
            scenarios = candidate

        normalized = PumpRequirement(
            sector_id=str(requirement.get("sector_id", "")),
            scenarios=scenarios,
            scenario_id=scenario_id,
            design_flow_lpm=float(requirement.get("design_flow_lpm", 0.0)),
            required_hmt_mca=requirement.get("required_hmt_mca"),
            required_pressure_mca=float(
                requirement.get("required_pressure_mca", 0.0)
            ),
            available_pressure_mca=requirement.get("available_pressure_mca"),
            pressure_margin_mca=requirement.get("pressure_margin_mca"),
            pump_required=requirement.get("pump_required"),
            critical_point_id=requirement.get("critical_point_id"),
            hydraulic_path_id=requirement.get("hydraulic_path_id"),
            distributed_losses_mca=requirement.get("distributed_losses_mca"),
            local_losses_mca=requirement.get("local_losses_mca"),
            source_system_restrictions=_normalize_optional_mapping(
                requirement.get("source_system_restrictions")
            ),
            split_source_system_restrictions=_normalize_optional_mapping(
                requirement.get("split_source_system_restrictions")
            ),
            provenance=requirement.get("provenance") if isinstance(requirement.get("provenance"), PumpRequirementProvenance) else None,
            status=requirement.get("status") if isinstance(requirement.get("status"), PumpRequirementStatus) else None,
            value_version=requirement.get("value_version"),
        )

    normalized.validate()
    return normalized


def build_pump_requirement_from_sector(
    sector_result: SectorCalculationResult | Mapping[str, Any],
    *,
    scenarios: Optional[Sequence[str]] = None,
    critical_point_id: Optional[str] = None,
    hydraulic_path_id: Optional[str] = None,
    distributed_losses_mca: Optional[float] = None,
    local_losses_mca: Optional[float] = None,
    source_system_restrictions: Optional[Mapping[str, str]] = None,
    split_source_system_restrictions: Optional[Mapping[str, str]] = None,
    provenance: Optional[PumpRequirementProvenance] = None,
    status: Optional[PumpRequirementStatus] = None,
    value_version: Optional[str] = None,
    pump_required: Optional[bool] = None,
    required_hmt_mca: Optional[float] = None,
) -> PumpRequirement:
    """
    Construye un PumpRequirement mínimo a partir de SectorCalculationResult.

    Proyección estricta de campos ya disponibles en el resultado del sector:
    - sector_id
    - design_flow_lpm
    - required_pressure_mca
    - available_pressure_mca
    - pressure_margin_mca

    Hasta que exista trazabilidad real del maestro:
    - required_hmt_mca queda None
    - distributed_losses_mca y local_losses_mca quedan None
    - critical_point_id e hydraulic_path_id quedan como referencias opcionales
      aportadas por el contexto de entrada, no se inventan.
    - scenarios, source_system_restrictions, provenance/status/version
      se materializan como referencias o metadatos de contexto.
    """
    if isinstance(sector_result, SectorCalculationResult):
        normalized_sector = sector_result
    else:
        normalized_sector = SectorCalculationResult(
            sector_id=str(sector_result.get("sector_id", "")),
            flow_lpm=float(sector_result.get("flow_lpm", 0.0)),
            head_loss_mca=float(sector_result.get("head_loss_mca", 0.0)),
            required_pressure_mca=float(
                sector_result.get("required_pressure_mca", 0.0)
            ),
            available_pressure_mca=sector_result.get("available_pressure_mca"),
            pressure_margin_mca=sector_result.get("pressure_margin_mca"),
            minimum_pressure_mca=sector_result.get("minimum_pressure_mca"),
            pump_head_mca=sector_result.get("pump_head_mca"),
            satisfied=sector_result.get("satisfied"),
            phase=int(sector_result.get("phase", 1)),
        )

    criterion = None
    if required_hmt_mca is not None:
        numeric_hmt = float(required_hmt_mca)
        if not isfinite(numeric_hmt) or numeric_hmt < 0:
            raise HydraulicInputError("pump.required_hmt_invalid")
        criterion = numeric_hmt

    requirement = PumpRequirement(
        sector_id=normalized_sector.sector_id,
        scenarios=scenarios,
        design_flow_lpm=normalized_sector.flow_lpm,
        required_hmt_mca=criterion,
        required_pressure_mca=normalized_sector.required_pressure_mca,
        available_pressure_mca=normalized_sector.available_pressure_mca,
        pressure_margin_mca=normalized_sector.pressure_margin_mca,
        pump_required=pump_required,
        critical_point_id=critical_point_id,
        hydraulic_path_id=hydraulic_path_id,
        distributed_losses_mca=distributed_losses_mca,
        local_losses_mca=local_losses_mca,
        source_system_restrictions=_normalize_optional_mapping(
            source_system_restrictions
        ),
        split_source_system_restrictions=_normalize_optional_mapping(
            split_source_system_restrictions
        ),
        provenance=provenance,
        status=status,
        value_version=value_version,
    )

    requirement.validate()
    return requirement
