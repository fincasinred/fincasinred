import math

import pytest

from backend.domain.hydraulic import (
    HydraulicComponent,
    HydraulicEndpoint,
    HydraulicInputError,
    SectorCalculationResult,
    calculate_sector,
    calculate_total_flow,
    validate_component,
    validate_endpoint,
)


def test_minimum_pressure_can_be_none():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=2.0,
        flow_lpm=10.0,
    )

    result = calculate_sector(
        endpoint,
        head_loss_mca=1.0,
        available_pressure_mca=5.0,
        minimum_pressure_mca=None,
    )

    assert isinstance(result, SectorCalculationResult)
    assert result.minimum_pressure_mca is None
    assert result.required_pressure_mca == 2.0
    assert result.satisfied is True


def test_phase_1_keeps_pump_head_as_none():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=2.0,
        flow_lpm=10.0,
    )

    result = calculate_sector(
        endpoint,
        head_loss_mca=1.0,
        available_pressure_mca=5.0,
        minimum_pressure_mca=None,
        pump_head_mca=None,
        phase=1,
    )

    assert result.phase == 1
    assert result.pump_head_mca is None


def test_phase_1_does_not_select_a_pump():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=2.0,
        flow_lpm=10.0,
    )

    result = calculate_sector(
        endpoint,
        head_loss_mca=1.0,
        available_pressure_mca=None,
        minimum_pressure_mca=None,
        pump_head_mca=None,
        phase=1,
    )

    assert result.pump_head_mca is None
    assert result.available_pressure_mca is None
    assert result.pressure_margin_mca is None
    assert result.satisfied is None


def test_sector_result_uses_derived_values():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=2.0,
        flow_lpm=12.0,
    )

    result = calculate_sector(
        endpoint,
        head_loss_mca=1.5,
        available_pressure_mca=6.0,
        minimum_pressure_mca=None,
    )

    assert result.sector_id == "sector-1"
    assert result.flow_lpm == 12.0
    assert result.head_loss_mca == 1.5
    assert result.available_pressure_mca == 4.5
    assert result.required_pressure_mca == 2.0
    assert result.pressure_margin_mca == 2.5
    assert result.satisfied is True


def test_unknown_endpoint_sector_raises_domain_error():
    with pytest.raises(
        HydraulicInputError,
        match="endpoint\\.sector_unknown",
    ):
        validate_endpoint(
            {
                "pressure_required_mca": 2.0,
                "flow_lpm": 10.0,
            }
        )


def test_empty_endpoint_sector_raises_domain_error():
    endpoint = HydraulicEndpoint(
        sector_id="",
        pressure_required_mca=2.0,
        flow_lpm=10.0,
    )

    with pytest.raises(
        HydraulicInputError,
        match="endpoint\\.sector_unknown",
    ):
        validate_endpoint(endpoint)


@pytest.mark.parametrize(
    "field_name",
    [
        "k_value",
        "equivalent_length_m",
        "fixed_loss_mca",
    ],
)
def test_component_rejects_nan(field_name):
    component = HydraulicComponent(
        name="test",
        **{field_name: math.nan},
    )

    with pytest.raises(
        HydraulicInputError,
        match="component\\.value_not_finite",
    ):
        validate_component(component)


@pytest.mark.parametrize(
    "field_name",
    [
        "k_value",
        "equivalent_length_m",
        "fixed_loss_mca",
    ],
)
def test_component_rejects_infinity(field_name):
    component = HydraulicComponent(
        name="test",
        **{field_name: math.inf},
    )

    with pytest.raises(
        HydraulicInputError,
        match="component\\.value_not_finite",
    ):
        validate_component(component)


def test_component_rejects_negative_k_value():
    component = HydraulicComponent(
        name="test",
        k_value=-1.0,
    )

    with pytest.raises(
        HydraulicInputError,
        match="component\\.k_value_invalid",
    ):
        validate_component(component)


def test_component_rejects_negative_equivalent_length():
    component = HydraulicComponent(
        name="test",
        equivalent_length_m=-1.0,
    )

    with pytest.raises(
        HydraulicInputError,
        match="component\\.equivalent_length_invalid",
    ):
        validate_component(component)


def test_component_rejects_negative_fixed_loss():
    component = HydraulicComponent(
        name="test",
        fixed_loss_mca=-1.0,
    )

    with pytest.raises(
        HydraulicInputError,
        match="component\\.fixed_loss_invalid",
    ):
        validate_component(component)


def test_total_flow_is_calculated_from_endpoints():
    endpoints = [
        HydraulicEndpoint(
            sector_id="sector-1",
            flow_lpm=10.0,
        ),
        HydraulicEndpoint(
            sector_id="sector-1",
            flow_lpm=15.0,
        ),
        HydraulicEndpoint(
            sector_id="sector-1",
            flow_lpm=5.0,
        ),
    ]

    assert calculate_total_flow(endpoints) == 30.0


def test_required_pressure_respects_minimum_pressure():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=2.0,
        flow_lpm=10.0,
    )

    result = calculate_sector(
        endpoint,
        head_loss_mca=1.0,
        available_pressure_mca=8.0,
        minimum_pressure_mca=4.0,
    )

    assert result.required_pressure_mca == 4.0
    assert result.available_pressure_mca == 7.0
    assert result.pressure_margin_mca == 3.0
    assert result.satisfied is True


def test_insufficient_pressure_is_reported():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=5.0,
        flow_lpm=10.0,
    )

    result = calculate_sector(
        endpoint,
        head_loss_mca=2.0,
        available_pressure_mca=6.0,
        minimum_pressure_mca=None,
    )

    assert result.available_pressure_mca == 4.0
    assert result.pressure_margin_mca == -1.0
    assert result.satisfied is False


def test_nan_endpoint_flow_is_rejected():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=2.0,
        flow_lpm=math.nan,
    )

    with pytest.raises(
        HydraulicInputError,
        match="endpoint\\.value_not_finite",
    ):
        validate_endpoint(endpoint)


def test_infinite_endpoint_pressure_is_rejected():
    endpoint = HydraulicEndpoint(
        sector_id="sector-1",
        pressure_required_mca=math.inf,
        flow_lpm=10.0,
    )

    with pytest.raises(
        HydraulicInputError,
        match="endpoint\\.value_not_finite",
    ):
        validate_endpoint(endpoint)