use embassy_stm32::Config;
use embassy_stm32::rcc::{
    AHBPrescaler, APBPrescaler, Hse, HseMode, Pll, PllDiv, PllMul, PllPreDiv, PllSource, Sysclk,
    VoltageScale,
};
use embassy_stm32::time::Hertz;

pub fn config(hse_hz: u32) -> Config {
    let mut config = Config::default();
    let rcc = &mut config.rcc;
    rcc.hsi = None;
    rcc.csi = false;
    rcc.hsi48 = None;
    rcc.hse = Some(Hse {
        freq: Hertz(hse_hz),
        mode: HseMode::Oscillator,
    });
    rcc.pll1 = Some(Pll {
        source: PllSource::HSE,
        prediv: PllPreDiv::DIV2,
        mul: PllMul::MUL240,
        fracn: None,
        divp: Some(PllDiv::DIV2),
        divq: Some(PllDiv::DIV10),
        divr: None,
    });
    rcc.sys = Sysclk::PLL1_P;
    rcc.d1c_pre = AHBPrescaler::DIV1;
    rcc.ahb_pre = AHBPrescaler::DIV2;
    rcc.apb1_pre = APBPrescaler::DIV2;
    rcc.apb2_pre = APBPrescaler::DIV2;
    rcc.apb3_pre = APBPrescaler::DIV2;
    rcc.apb4_pre = APBPrescaler::DIV2;
    rcc.voltage_scale = VoltageScale::Scale0;
    config
}
