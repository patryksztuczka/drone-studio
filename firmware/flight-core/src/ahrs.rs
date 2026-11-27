use crate::math::{G, Q, V3};

#[derive(Clone, Copy, Debug, Default)]
pub struct Mahony {
    pub q: Q,
    integral: V3,
}

impl Mahony {
    pub fn align(&mut self, accel: V3, yaw: f32) {
        let roll = libm::atan2f(-accel.y, -accel.z);
        let pitch = libm::atan2f(accel.x, libm::sqrtf(accel.y * accel.y + accel.z * accel.z));
        self.q = Q::from_euler(roll, pitch, yaw);
        self.integral = V3::ZERO;
    }

    pub fn update(&mut self, gyro: V3, accel: V3, kp: f32, ki: f32, dt: f32) -> V3 {
        let norm = accel.norm();
        let mut omega = gyro;
        if norm > 0.85 * G && norm < 1.15 * G {
            let measured_down = accel * (-1.0 / norm);
            let estimated_down = self.q.inverse_rotate(V3::new(0.0, 0.0, 1.0));
            let error = measured_down.cross(estimated_down);
            self.integral = self.integral + error * (ki * dt);
            omega = omega + error * kp + self.integral;
        }
        self.q = self.q.integrate(omega, dt);
        omega
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converges_to_tilted_gravity() {
        let mut m = Mahony::default();
        let roll = 0.3_f32;
        let accel = V3::new(0.0, -G * libm::sinf(roll), -G * libm::cosf(roll));
        for _ in 0..10_000 {
            m.update(V3::ZERO, accel, 1.0, 0.0, 0.001);
        }
        assert!((m.q.euler().x - roll).abs() < 0.01, "{}", m.q.euler().x);
    }

    #[test]
    fn align_matches_accelerometer() {
        let mut m = Mahony::default();
        let pitch = -0.2_f32;
        m.align(
            V3::new(G * libm::sinf(pitch), 0.0, -G * libm::cosf(pitch)),
            0.0,
        );
        assert!((m.q.euler().y - pitch).abs() < 1e-4);
    }

    #[test]
    fn integrates_rotation() {
        let mut m = Mahony::default();
        for _ in 0..1000 {
            m.update(V3::new(0.0, 0.0, 1.0), V3::ZERO, 1.0, 0.0, 0.001);
        }
        assert!((m.q.euler().z - 1.0).abs() < 1e-3);
    }
}
