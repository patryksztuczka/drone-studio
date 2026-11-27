pub struct Spectrum {
    pub freq_hz: Vec<f32>,
    pub magnitude: Vec<f32>,
}

fn fft(re: &mut [f64], im: &mut [f64]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * core::f64::consts::PI / len as f64;
        let (wr, wi) = (ang.cos(), ang.sin());
        for start in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1.0, 0.0);
            for k in 0..len / 2 {
                let (a, b) = (start + k, start + k + len / 2);
                let (tr, ti) = (re[b] * cr - im[b] * ci, re[b] * ci + im[b] * cr);
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                let next = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = next;
            }
        }
        len <<= 1;
    }
}

pub fn magnitude_spectrum(signal: &[f32], sample_rate_hz: f64) -> Spectrum {
    let n = signal.len().next_power_of_two().clamp(16, 4096);
    let take = signal.len().min(n);
    let tail = &signal[signal.len() - take..];
    let mean = tail.iter().map(|v| f64::from(*v)).sum::<f64>() / take.max(1) as f64;
    let mut re = vec![0.0; n];
    let mut im = vec![0.0; n];
    for (i, v) in tail.iter().enumerate() {
        let w =
            0.5 - 0.5 * (2.0 * core::f64::consts::PI * i as f64 / (take.max(2) - 1) as f64).cos();
        re[i] = (f64::from(*v) - mean) * w;
    }
    fft(&mut re, &mut im);
    let half = n / 2;
    let scale = 4.0 / take.max(1) as f64;
    Spectrum {
        freq_hz: (0..half)
            .map(|k| (k as f64 * sample_rate_hz / n as f64) as f32)
            .collect(),
        magnitude: (0..half)
            .map(|k| ((re[k] * re[k] + im[k] * im[k]).sqrt() * scale) as f32)
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_tone() {
        let fs = 500.0;
        let x: Vec<f32> = (0..1024)
            .map(|i| (2.0 * core::f64::consts::PI * 80.0 * f64::from(i) / fs).sin() as f32)
            .collect();
        let s = magnitude_spectrum(&x, fs);
        let (k, _) = s
            .magnitude
            .iter()
            .enumerate()
            .fold((0, 0.0_f32), |b, (i, v)| if *v > b.1 { (i, *v) } else { b });
        assert!((s.freq_hz[k] - 80.0).abs() < 1.0, "{}", s.freq_hz[k]);
    }
}
