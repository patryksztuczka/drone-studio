use crate::model::{MotorModel, PropModel};

const FOUR_PI_SQ: f64 = 4.0 * core::f64::consts::PI * core::f64::consts::PI;

pub fn thrust_constant(prop: &PropModel, density: f64) -> f64 {
    prop.thrust_coefficient * density * libm::pow(prop.diameter_m, 4.0) / FOUR_PI_SQ
}

pub fn torque_constant(prop: &PropModel, density: f64) -> f64 {
    prop.torque_coefficient * density * libm::pow(prop.diameter_m, 5.0) / FOUR_PI_SQ
}

pub fn steady_state_omega(motor: &MotorModel, k_torque: f64, applied_voltage: f64) -> f64 {
    let kv = motor.kv_rad_per_s_per_v;
    let a = motor.resistance_ohm * k_torque * kv;
    let b = 1.0 / kv;
    let c = motor.resistance_ohm * motor.no_load_current_a - applied_voltage;
    if c >= 0.0 {
        return 0.0;
    }
    (-b + libm::sqrt(b * b - 4.0 * a * c)) / (2.0 * a)
}

pub fn steady_state_current(motor: &MotorModel, k_torque: f64, omega: f64) -> f64 {
    if omega <= 0.0 {
        return 0.0;
    }
    k_torque * omega * omega * motor.kv_rad_per_s_per_v + motor.no_load_current_a
}

pub fn ground_effect_factor(height_m: f64, rotor_radius_m: f64) -> f64 {
    let h = height_m.max(rotor_radius_m * 0.5);
    let r = rotor_radius_m / (4.0 * h);
    1.0 / (1.0 - r * r)
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RotorState {
    pub omega: f64,
    pub phase: f64,
    pub current_a: f64,
    pub thrust_n: f64,
    pub torque_nm: f64,
    pub command: f64,
}

pub fn advance_rotor(
    rotor: &mut RotorState,
    motor: &MotorModel,
    k_torque: f64,
    command: f64,
    bus_voltage: f64,
    dt: f64,
) {
    let cmd = command.clamp(0.0, 1.0);
    let target = steady_state_omega(motor, k_torque, cmd * bus_voltage);
    let alpha = 1.0 - libm::exp(-dt / motor.time_constant_s);
    rotor.omega += (target - rotor.omega) * alpha;
    rotor.omega = rotor.omega.max(0.0);
    rotor.phase = libm::fmod(rotor.phase + rotor.omega * dt, 2.0 * core::f64::consts::PI);
    let back_emf = rotor.omega / motor.kv_rad_per_s_per_v;
    let electrical = (cmd * bus_voltage - back_emf) / motor.resistance_ohm;
    let floor = if rotor.omega > 0.0 {
        motor.no_load_current_a.min(electrical.max(0.0))
    } else {
        0.0
    };
    rotor.current_a = electrical.clamp(floor, motor.max_current_a * 1.6);
    rotor.command = cmd;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn motor() -> MotorModel {
        MotorModel {
            id: "m".into(),
            kv_rad_per_s_per_v: 8000.0 * core::f64::consts::PI / 30.0,
            resistance_ohm: 0.3,
            no_load_current_a: 0.3,
            max_current_a: 7.0,
            time_constant_s: 0.025,
        }
    }

    fn prop() -> PropModel {
        PropModel {
            id: "p".into(),
            diameter_m: 0.051,
            thrust_coefficient: 0.2,
            torque_coefficient: 0.02,
            rotor_drag_coefficient: 0.0006,
        }
    }

    #[test]
    fn steady_state_balances_voltage() {
        let m = motor();
        let kq = torque_constant(&prop(), 1.2);
        let w = steady_state_omega(&m, kq, 7.4);
        let i = steady_state_current(&m, kq, w);
        let v = i * m.resistance_ohm + w / m.kv_rad_per_s_per_v;
        assert!((v - 7.4).abs() < 1e-9);
    }

    #[test]
    fn thrust_in_expected_range_for_two_inch_prop() {
        let m = motor();
        let p = prop();
        let kt = thrust_constant(&p, 1.2);
        let kq = torque_constant(&p, 1.2);
        let w = steady_state_omega(&m, kq, 7.6);
        let thrust = kt * w * w;
        assert!(thrust > 0.8 && thrust < 1.5, "thrust {thrust}");
    }

    #[test]
    fn first_order_response() {
        let m = motor();
        let kq = torque_constant(&prop(), 1.2);
        let mut r = RotorState::default();
        let target = steady_state_omega(&m, kq, 8.0);
        let dt = 0.0005;
        let steps = (m.time_constant_s / dt).round() as usize;
        for _ in 0..steps {
            advance_rotor(&mut r, &m, kq, 1.0, 8.0, dt);
        }
        let frac = r.omega / target;
        assert!((frac - 0.632).abs() < 0.01, "{frac}");
    }

    #[test]
    fn ground_effect_is_bounded() {
        assert!((ground_effect_factor(10.0, 0.025) - 1.0).abs() < 1e-5);
        assert!(ground_effect_factor(0.0, 0.025) <= 1.0 / (1.0 - 0.25) + 1e-12);
        assert!(ground_effect_factor(0.02, 0.025) > 1.05);
    }
}
