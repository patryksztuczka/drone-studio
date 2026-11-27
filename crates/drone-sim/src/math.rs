use core::ops::{Add, AddAssign, Div, Mul, Neg, Sub};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0);

    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub const fn from_array(v: [f64; 3]) -> Self {
        Self::new(v[0], v[1], v[2])
    }

    pub const fn to_array(self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }

    pub fn dot(self, o: Self) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }

    pub fn cross(self, o: Self) -> Self {
        Self::new(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }

    pub fn norm(self) -> f64 {
        libm::sqrt(self.dot(self))
    }

    pub fn component_mul(self, o: Self) -> Self {
        Self::new(self.x * o.x, self.y * o.y, self.z * o.z)
    }
}

impl Add for Vec3 {
    type Output = Self;
    fn add(self, o: Self) -> Self {
        Self::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
}

impl AddAssign for Vec3 {
    fn add_assign(&mut self, o: Self) {
        *self = *self + o;
    }
}

impl Sub for Vec3 {
    type Output = Self;
    fn sub(self, o: Self) -> Self {
        Self::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
}

impl Mul<f64> for Vec3 {
    type Output = Self;
    fn mul(self, s: f64) -> Self {
        Self::new(self.x * s, self.y * s, self.z * s)
    }
}

impl Div<f64> for Vec3 {
    type Output = Self;
    fn div(self, s: f64) -> Self {
        Self::new(self.x / s, self.y / s, self.z / s)
    }
}

impl Neg for Vec3 {
    type Output = Self;
    fn neg(self) -> Self {
        Self::new(-self.x, -self.y, -self.z)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Mat3 {
    pub m: [[f64; 3]; 3],
}

impl Mat3 {
    pub const IDENTITY: Self = Self {
        m: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
    };

    pub const fn new(m: [[f64; 3]; 3]) -> Self {
        Self { m }
    }

    pub fn mul_vec(&self, v: Vec3) -> Vec3 {
        let m = &self.m;
        Vec3::new(
            m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
            m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
            m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
        )
    }

    pub fn transpose(&self) -> Self {
        let m = &self.m;
        Self::new([
            [m[0][0], m[1][0], m[2][0]],
            [m[0][1], m[1][1], m[2][1]],
            [m[0][2], m[1][2], m[2][2]],
        ])
    }

    pub fn mul_mat(&self, o: &Self) -> Self {
        let mut r = [[0.0; 3]; 3];
        for (i, row) in r.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell = (0..3).map(|k| self.m[i][k] * o.m[k][j]).sum();
            }
        }
        Self::new(r)
    }

    pub fn determinant(&self) -> f64 {
        let m = &self.m;
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    }

    pub fn inverse(&self) -> Option<Self> {
        let d = self.determinant();
        if libm::fabs(d) < 1e-18 {
            return None;
        }
        let m = &self.m;
        let c = |a: usize, b: usize, c: usize, e: usize| m[a][b] * m[c][e] - m[a][e] * m[c][b];
        Some(Self::new([
            [c(1, 1, 2, 2) / d, -c(0, 1, 2, 2) / d, c(0, 1, 1, 2) / d],
            [-c(1, 0, 2, 2) / d, c(0, 0, 2, 2) / d, -c(0, 0, 1, 2) / d],
            [c(1, 0, 2, 1) / d, -c(0, 0, 2, 1) / d, c(0, 0, 1, 1) / d],
        ]))
    }

    pub fn rotation_z(angle_rad: f64) -> Self {
        let (s, c) = (libm::sin(angle_rad), libm::cos(angle_rad));
        Self::new([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
    }

    pub fn rotation_x(angle_rad: f64) -> Self {
        let (s, c) = (libm::sin(angle_rad), libm::cos(angle_rad));
        Self::new([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Quat {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Default for Quat {
    fn default() -> Self {
        Self::IDENTITY
    }
}

impl Quat {
    pub const IDENTITY: Self = Self::new(1.0, 0.0, 0.0, 0.0);

    pub const fn new(w: f64, x: f64, y: f64, z: f64) -> Self {
        Self { w, x, y, z }
    }

    pub fn from_euler(roll: f64, pitch: f64, yaw: f64) -> Self {
        let (sr, cr) = (libm::sin(roll * 0.5), libm::cos(roll * 0.5));
        let (sp, cp) = (libm::sin(pitch * 0.5), libm::cos(pitch * 0.5));
        let (sy, cy) = (libm::sin(yaw * 0.5), libm::cos(yaw * 0.5));
        Self::new(
            cr * cp * cy + sr * sp * sy,
            sr * cp * cy - cr * sp * sy,
            cr * sp * cy + sr * cp * sy,
            cr * cp * sy - sr * sp * cy,
        )
    }

    pub fn to_euler(self) -> Vec3 {
        let Self { w, x, y, z } = self;
        let roll = libm::atan2(2.0 * (w * x + y * z), 1.0 - 2.0 * (x * x + y * y));
        let sinp = (2.0 * (w * y - z * x)).clamp(-1.0, 1.0);
        let pitch = libm::asin(sinp);
        let yaw = libm::atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z));
        Vec3::new(roll, pitch, yaw)
    }

    pub fn norm(self) -> f64 {
        libm::sqrt(self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z)
    }

    pub fn normalized(self) -> Self {
        let n = self.norm();
        Self::new(self.w / n, self.x / n, self.y / n, self.z / n)
    }

    pub fn conjugate(self) -> Self {
        Self::new(self.w, -self.x, -self.y, -self.z)
    }

    pub fn compose(self, o: Self) -> Self {
        Self::new(
            self.w * o.w - self.x * o.x - self.y * o.y - self.z * o.z,
            self.w * o.x + self.x * o.w + self.y * o.z - self.z * o.y,
            self.w * o.y - self.x * o.z + self.y * o.w + self.z * o.x,
            self.w * o.z + self.x * o.y - self.y * o.x + self.z * o.w,
        )
    }

    pub fn rotate(self, v: Vec3) -> Vec3 {
        let u = Vec3::new(self.x, self.y, self.z);
        let t = u.cross(v) * 2.0;
        v + t * self.w + u.cross(t)
    }

    pub fn inverse_rotate(self, v: Vec3) -> Vec3 {
        self.conjugate().rotate(v)
    }

    pub fn derivative(self, omega_body: Vec3) -> Self {
        let o = Self::new(0.0, omega_body.x, omega_body.y, omega_body.z);
        let d = self.compose(o);
        Self::new(d.w * 0.5, d.x * 0.5, d.y * 0.5, d.z * 0.5)
    }

    pub fn add_scaled(self, d: Self, s: f64) -> Self {
        Self::new(
            self.w + d.w * s,
            self.x + d.x * s,
            self.y + d.y * s,
            self.z + d.z * s,
        )
    }

    pub fn tilt(self) -> f64 {
        let down = self.rotate(Vec3::new(0.0, 0.0, 1.0));
        libm::acos(down.z.clamp(-1.0, 1.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn euler_round_trip() {
        let q = Quat::from_euler(0.3, -0.2, 1.1);
        let e = q.to_euler();
        assert!((e.x - 0.3).abs() < 1e-12);
        assert!((e.y + 0.2).abs() < 1e-12);
        assert!((e.z - 1.1).abs() < 1e-12);
    }

    #[test]
    fn rotation_matches_matrix() {
        let q = Quat::from_euler(0.0, 0.0, core::f64::consts::FRAC_PI_2);
        let v = q.rotate(Vec3::new(1.0, 0.0, 0.0));
        assert!((v.y - 1.0).abs() < 1e-12);
        let m = Mat3::rotation_z(core::f64::consts::FRAC_PI_2).mul_vec(Vec3::new(1.0, 0.0, 0.0));
        assert!((m.y - 1.0).abs() < 1e-12);
    }

    #[test]
    fn inverse_matrix() {
        let a = Mat3::new([[2.0, 0.1, 0.0], [0.1, 3.0, 0.2], [0.0, 0.2, 4.0]]);
        let i = a.mul_mat(&a.inverse().unwrap());
        for (r, row) in i.m.iter().enumerate() {
            for (c, v) in row.iter().enumerate() {
                let expected = if r == c { 1.0 } else { 0.0 };
                assert!((v - expected).abs() < 1e-12);
            }
        }
    }
}
