pub fn greeting(airframe: &str) -> String {
    format!("Hello from drone-engine (airframe: {airframe})")
}

fn main() {
    println!("{}", greeting("palm_x4_2in"));
}

#[cfg(test)]
mod tests {
    use super::greeting;

    #[test]
    fn formats_airframe_greeting() {
        assert_eq!(
            greeting("palm_x4_2in"),
            "Hello from drone-engine (airframe: palm_x4_2in)"
        );
    }
}
