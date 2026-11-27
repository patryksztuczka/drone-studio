use core::ops::{Add, Mul, Sub};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl V3 {
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0);

    pub const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    pub const fn from_array(a: [f32; 3]) -> Self {
        Self::new(a[0], a[1], a[2])
    }

    pub const fn to_array(self) -> [f32; 3] {
        [self.x, self.y, self.z]
    }

    pub fn dot(self, o: Self) -> f32 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }

    pub fn cross(self, o: Self) -> Self {
        Self::new(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }

    pub fn norm(self) -> f32 {
        libm::sqrtf(self.dot(self))
    }

    pub fn get(self, i: usize) -> f32 {
        match i {
            0 => self.x,
            1 => self.y,
            _ => self.z,
        }
    }
}

impl Add for V3 {
    type Output = Self;
    fn add(self, o: Self) -> Self {
        Self::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
}

impl Sub for V3 {
    type Output = Self;
    fn sub(self, o: Self) -> Self {
        Self::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
}

impl Mul<f32> for V3 {
    type Output = Self;
    fn mul(self, s: f32) -> Self {
        Self::new(self.x * s, self.y * s, self.z * s)
    }
}

pub fn mat_mul(m: &[[f32; 3]; 3], v: V3) -> V3 {
    V3::new(
        m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
        m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
        m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
    )
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Q {
    pub w: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Default for Q {
    fn default() -> Self {
        Self::IDENTITY
    }
}

impl Q {
    pub const IDENTITY: Self = Self {
        w: 1.0,
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub const fn to_array(self) -> [f32; 4] {
        [self.w, self.x, self.y, self.z]
    }

    pub fn from_euler(roll: f32, pitch: f32, yaw: f32) -> Self {
        let (sr, cr) = (libm::sinf(roll * 0.5), libm::cosf(roll * 0.5));
        let (sp, cp) = (libm::sinf(pitch * 0.5), libm::cosf(pitch * 0.5));
        let (sy, cy) = (libm::sinf(yaw * 0.5), libm::cosf(yaw * 0.5));
        Self {
            w: cr * cp * cy + sr * sp * sy,
            x: sr * cp * cy - cr * sp * sy,
            y: cr * sp * cy + sr * cp * sy,
            z: cr * cp * sy - sr * sp * cy,
        }
    }

    pub fn euler(self) -> V3 {
        let Self { w, x, y, z } = self;
        let roll = libm::atan2f(2.0 * (w * x + y * z), 1.0 - 2.0 * (x * x + y * y));
        let pitch = libm::asinf((2.0 * (w * y - z * x)).clamp(-1.0, 1.0));
        let yaw = libm::atan2f(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z));
        V3::new(roll, pitch, yaw)
    }

    pub fn conjugate(self) -> Self {
        Self {
            w: self.w,
            x: -self.x,
            y: -self.y,
            z: -self.z,
        }
    }

    pub fn compose(self, o: Self) -> Self {
        Self {
            w: self.w * o.w - self.x * o.x - self.y * o.y - self.z * o.z,
            x: self.w * o.x + self.x * o.w + self.y * o.z - self.z * o.y,
            y: self.w * o.y - self.x * o.z + self.y * o.w + self.z * o.x,
            z: self.w * o.z + self.x * o.y - self.y * o.x + self.z * o.w,
        }
    }

    pub fn normalized(self) -> Self {
        let n = libm::sqrtf(self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z);
        if n < 1e-9 {
            return Self::IDENTITY;
        }
        Self {
            w: self.w / n,
            x: self.x / n,
            y: self.y / n,
            z: self.z / n,
        }
    }

    pub fn rotate(self, v: V3) -> V3 {
        let u = V3::new(self.x, self.y, self.z);
        let t = u.cross(v) * 2.0;
        v + t * self.w + u.cross(t)
    }

    pub fn inverse_rotate(self, v: V3) -> V3 {
        self.conjugate().rotate(v)
    }

    pub fn integrate(self, omega: V3, dt: f32) -> Self {
        let d = self.compose(Self {
            w: 0.0,
            x: omega.x,
            y: omega.y,
            z: omega.z,
        });
        Self {
            w: self.w + 0.5 * d.w * dt,
            x: self.x + 0.5 * d.x * dt,
            y: self.y + 0.5 * d.y * dt,
            z: self.z + 0.5 * d.z * dt,
        }
        .normalized()
    }

    pub fn tilt_cos(self) -> f32 {
        1.0 - 2.0 * (self.x * self.x + self.y * self.y)
    }
}

pub const DEG: f32 = core::f32::consts::PI / 180.0;
pub const G: f32 = 9.806_65;
