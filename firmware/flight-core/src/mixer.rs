#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct MixResult {
    pub thrust: [f32; 4],
    pub saturated: bool,
}

pub fn mix(matrix: &[[f32; 3]; 4], collective: f32, torque: [f32; 3], idle: f32) -> MixResult {
    let mut attitude = [0.0_f32; 4];
    for (i, row) in matrix.iter().enumerate() {
        attitude[i] = row[0] * torque[0] + row[1] * torque[1] + row[2] * torque[2];
    }
    let lo = attitude.iter().copied().fold(f32::INFINITY, f32::min);
    let hi = attitude.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let span = hi - lo;
    let room = 1.0 - idle;
    let mut saturated = false;
    if span > room {
        let s = room / span;
        for a in &mut attitude {
            *a *= s;
        }
        saturated = true;
    }
    let lo = attitude.iter().copied().fold(f32::INFINITY, f32::min);
    let hi = attitude.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let top = 1.0 - hi;
    let bottom = idle - lo;
    let mut t = collective;
    if t > top {
        saturated = saturated || t - top > 0.005;
        t = top;
    }
    if t < bottom {
        t = bottom;
    }
    let mut thrust = [0.0_f32; 4];
    for i in 0..4 {
        thrust[i] = (t + attitude[i]).clamp(0.0, 1.0);
    }
    MixResult { thrust, saturated }
}

pub fn thrust_to_command(thrust: f32) -> f32 {
    libm::sqrtf(thrust.clamp(0.0, 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    const X4: [[f32; 3]; 4] = [
        [-1.0, 1.0, 1.0],
        [-1.0, -1.0, -1.0],
        [1.0, -1.0, 1.0],
        [1.0, 1.0, -1.0],
    ];

    #[test]
    fn pure_collective() {
        let r = mix(&X4, 0.3, [0.0; 3], 0.02);
        assert_eq!(r.thrust, [0.3; 4]);
        assert!(!r.saturated);
    }

    #[test]
    fn roll_right_speeds_up_left_rotors() {
        let r = mix(&X4, 0.3, [0.1, 0.0, 0.0], 0.02);
        assert!(r.thrust[2] > r.thrust[0] && r.thrust[3] > r.thrust[1]);
    }

    #[test]
    fn attitude_wins_over_collective_at_the_top() {
        let r = mix(&X4, 0.95, [0.2, 0.0, 0.0], 0.02);
        assert!(r.saturated);
        assert!(r.thrust.iter().all(|t| *t <= 1.0));
        assert!((r.thrust[2] - r.thrust[0] - 0.4).abs() < 1e-5);
    }

    #[test]
    fn huge_demand_is_scaled() {
        let r = mix(&X4, 0.5, [2.0, 2.0, 0.0], 0.02);
        assert!(r.saturated);
        assert!(r.thrust.iter().all(|t| (0.0..=1.0).contains(t)));
    }
}
