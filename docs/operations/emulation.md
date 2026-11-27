# Emulation

The STM32H743 firmware in `firmware/target-stm32h7` is the real ARM `.elf`, built with embassy. `drone emu smoke` builds it, boots it in Renode on the board described by `emu/generated/ref_h743_aio.repl`, and runs the Robot suite in `emu/tests/boot_and_loop.robot`. Renode runs in a Linux container, so a Mac and a GitHub runner run the same image.

## Run it

```sh
pnpm check:firmware         # fmt, clippy and the release build of the firmware; part of pnpm verify
drone emu smoke             # or: cargo run -p drone-cli -- emu smoke
drone emu smoke --json      # { ok, elf, elf_bytes, image, tests, uart_log_tail, duration_s }
```

`drone emu smoke --json` prints the result as JSON and saves it to `.dev/emu-last.json`, where the Studio's EMU mode reads it. The `emu_smoke_test` MCP tool runs the same command.

You need rustup and a running Docker daemon. The first run builds the image `drone-studio-emu:<hash>`, where the hash is taken from `emu/Dockerfile`, so editing the Dockerfile builds a new image and leaves the old one in place. That first build takes a minute or two. After it, a run takes about ten seconds. Results land in `target/emu/smoke/`: Robot's `log.html` and `report.html`, `summary.json`, and one `<test>.uart.log` per test with what the firmware printed on USART2.

The exit code is 0 when every test passed, 1 when one failed and 2 when the run could not start, for example when Docker is not running or the firmware does not build.

## What the suite checks

Each test boots the ELF from reset on a fresh machine.

1. The firmware prints `BOOT`, reads `WHO_AM_I` over SPI1 and prints `IMU WHO_AM_I=0x47 OK`, configures the ICM-42688-P and enters the 1 kHz loop. After 100 ticks the `LOOP` line must show 100 IMU reads, 100 motor writes, idle duty on all four outputs, no tick errors and no IMU fault. The IMU model's own counters must agree.
2. Samples programmed into the model with `spi1.imu0 SetGyroRaw` and `SetAccelRaw` must come back in the firmware's `LOOP` line.
3. With bus access logging on, the firmware must write 0 to CCR3 and CCR4 of TIM3 and CCR1 and CCR2 of TIM5 from the running loop. The timers must run with ARR set for 8 kHz from a 240 MHz timer clock, PWM mode 1 and the four channels enabled.

The suite does not check flight behaviour. That is the simulator's job.

## The container

`emu/Dockerfile` starts from `debian:bookworm-slim`, pinned by digest, and installs Renode 1.17.0 from its portable release. Renode ships both a `linux-portable` (x86_64) and a `linux-arm64-portable` build from 1.17.0 on, and the Dockerfile picks one by `TARGETARCH` and checks its SHA-256. Apple Silicon therefore runs Renode natively instead of under amd64 emulation, which would be several times slower. Both builds embed the .NET runtime and the C# compiler Renode uses to load `emu/sensors/Icm42688p.cs` at run time.

The Robot dependencies come from Renode's own `tests/requirements.txt` and live in a virtualenv. psutil 5.9.4 has no arm64 wheel, so the image installs gcc for that step and removes it afterwards.

The container runs as your user, with the repository mounted at `/work`, so the files it writes in `target/emu/` belong to you on Linux too.

## The emulated board

`drone codegen` writes `emu/generated/ref_h743_aio.repl` from `hardware/`. On top of Renode's `stm32h743.repl` it adds:

- SPI1. Renode's STM32H7 platform only tags its address range, so the MCU manifest lists it under `renode.peripherals` and the generator registers an `SPI.STM32H7_SPI` there.
- `imu0`, the `ICM42688P` model on SPI1.
- A connection from the IMU's chip-select pin (`PC15` in the board manifest) to the model. Embassy's H7 SPI driver runs transfers in endless mode and never sets TSIZE, so Renode's SPI never ends a transaction on its own. The model starts a new transaction when chip select rises.

The IMU model implements the bank 0 registers the firmware uses: `WHO_AM_I` (0x47), `DEVICE_CONFIG` soft reset, `PWR_MGMT0`, `GYRO_CONFIG0`, `ACCEL_CONFIG0`, `INT_STATUS` and the big-endian accel and gyro data at 0x1F to 0x2A. Bit 7 of the first byte selects a read and the address auto-increments. Before `PWR_MGMT0` turns the sensors on, the data registers read -32768, as on the chip. From the Renode monitor:

```
spi1.imu0 SetGyroRaw 164 -328 492      # raw LSB
spi1.imu0 SetGyroDps 10 -20 30         # converted with the current GYRO_FS_SEL
spi1.imu0 SetAccelG 0 0 1              # converted with the current ACCEL_FS_SEL
spi1.imu0 WhoAmIReads                  # also DataReads, RegisterWrites, SoftResets, Transactions
```

## Clocks

The firmware runs the same clock tree in Renode and on the board: the 8 MHz HSE from the board manifest, PLL1 at 960 MHz VCO, 480 MHz system clock in VOS0, 240 MHz AHB and timer clocks, and PLL1Q at 96 MHz for SPI1, which divides it to 24 MHz. Renode's RCC model emulates PLL1, so no feature gate is needed.

Two things differ from the board. Renode's timers count at the fixed 250 MHz the platform file gives them, so embassy time, and with it the control loop, runs about 4% fast in virtual time. Renode also logs warnings when embassy rewrites `PLLCKSELR` to switch off PLL2 and PLL3 while PLL1 runs. The model ignores those writes, as the reference manual says the hardware does.

## What is stubbed

- The barometer. `Baro` returns no sample, so the flight core never finishes gyro calibration (it waits for three baro samples) and cannot arm. M1 has no radio either: `RadioInput` returns nothing, and the firmware has no other way to arm.
- The battery ADC. `BatteryAdc` returns a full 2S pack.
- Telemetry. USART2 carries human-readable log lines at 921600 baud, not `drone-protocol` frames.
