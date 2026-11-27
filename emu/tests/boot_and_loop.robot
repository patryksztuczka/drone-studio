*** Settings ***
Suite Setup                   Setup
Suite Teardown                Teardown
Test Setup                    Reset Emulation
Test Teardown                 Test Teardown
Resource                      ${RENODEKEYWORDS}

*** Variables ***
${ROOT}                       ${CURDIR}/../..
${ELF}                        ${ROOT}/firmware/target-stm32h7/target/thumbv7em-none-eabihf/release/target-stm32h7
${PLATFORM}                   ${ROOT}/emu/generated/ref_h743_aio.repl
${IMU_MODEL}                  ${ROOT}/emu/sensors/Icm42688p.cs
${UART}                       sysbus.usart2
${UART_LOG_DIR}               ${EMPTY}
${UART_TIMEOUT}               2
${MIN_TICKS}                  100
${IMU_FAULT}                  0x0080
${TIM3}                       0x40000400
${TIM5}                       0x40000C00
${TIMER_CLOCK_HZ}             240000000
${MOTOR_PWM_HZ}               8000
${CR1}                        0x00
${CCMR1}                      0x18
${CCMR2}                      0x1C
${CCER}                       0x20
${ARR}                        0x2C
${CCR1}                       0x34
${CCR2}                       0x38
${CCR3}                       0x3C
${CCR4}                       0x40

*** Keywords ***
Create Board
    Execute Command           include @${IMU_MODEL}
    Execute Command           mach create "ref_h743_aio"
    Execute Command           machine LoadPlatformDescription @${PLATFORM}
    Execute Command           sysbus LoadELF @${ELF}
    IF    '${UART_LOG_DIR}' != ''
        ${name}=              Replace String Using Regexp    ${TEST NAME}    [^A-Za-z0-9]+    _
        Execute Command       ${UART} CreateFileBackend @${UART_LOG_DIR}/${name}.uart.log true
    END
    Create Terminal Tester    ${UART}    timeout=${UART_TIMEOUT}    defaultPauseEmulation=true

Boot To Control Loop
    Create Board
    Start Emulation
    Wait For Line On Uart     BOOT palm_x4_2in board=ref_h743_aio mcu=stm32h743vi
    Wait For Line On Uart     IMU WHO_AM_I=0x47 OK
    Wait For Line On Uart     IMU CONFIG OK
    Wait For Line On Uart     MOTORS PWM hz=${MOTOR_PWM_HZ} outputs=4 duty=0
    Wait For Line On Uart     LOOP START hz=1000

Read Register
    [Arguments]               ${base}    ${offset}
    ${address}=               Evaluate    hex(${base} + ${offset})
    ${raw}=                   Execute Command    sysbus ReadDoubleWord ${address}
    ${value}=                 Convert To Integer    ${raw.strip()}
    RETURN                    ${value}

Register Should Be
    [Arguments]               ${base}    ${offset}    ${expected}
    ${value}=                 Read Register    ${base}    ${offset}
    Should Be Equal As Integers    ${value}    ${expected}    register ${base}+${offset} holds ${value}, expected ${expected}

Register Bits Should Be Set
    [Arguments]               ${base}    ${offset}    ${mask}
    ${value}=                 Read Register    ${base}    ${offset}
    ${masked}=                Evaluate    ${value} & ${mask}
    Should Be Equal As Integers    ${masked}    ${mask}    register ${base}+${offset} = ${value} lacks bits ${mask}

Counter Should Be At Least
    [Arguments]               ${property}    ${minimum}
    ${raw}=                   Execute Command    spi1.imu0 ${property}
    ${value}=                 Convert To Integer    ${raw.strip()}
    Should Be True            ${value} >= ${minimum}    spi1.imu0 ${property} = ${value}, expected at least ${minimum}

Motor Timer Should Hold Idle Duty
    [Arguments]               ${timer}    ${ccr_a}    ${ccr_b}    ${ccer_mask}    ${ccmr}    ${ccmr_mask}
    ${period}=                Evaluate    ${TIMER_CLOCK_HZ} // ${MOTOR_PWM_HZ} - 1
    Register Bits Should Be Set    ${timer}    ${CR1}    0x1
    Register Should Be        ${timer}    ${ARR}    ${period}
    Register Bits Should Be Set    ${timer}    ${CCER}    ${ccer_mask}
    Register Bits Should Be Set    ${timer}    ${ccmr}    ${ccmr_mask}
    Register Should Be        ${timer}    ${ccr_a}    0
    Register Should Be        ${timer}    ${ccr_b}    0

*** Test Cases ***
Should Probe The IMU And Run The Control Loop
    Boot To Control Loop
    ${status}=                Wait For Line On Uart    LOOP (\\d+) arm=Disarmed status=(0x[0-9A-F]{4}) imu_reads=(\\d+) motor_writes=(\\d+) duty=0,0,0,0 gyro=0,0,0 accel=0,0,2048 errors=0    treatAsRegex=true
    Should Be True            ${status.Groups[0]} >= ${MIN_TICKS}
    Should Be True            (${status.Groups[1]} & ${IMU_FAULT}) == 0    flight core flagged an IMU fault: status ${status.Groups[1]}
    Should Be True            ${status.Groups[2]} >= ${MIN_TICKS}
    Should Be True            ${status.Groups[3]} >= ${MIN_TICKS}
    Counter Should Be At Least    WhoAmIReads    1
    Counter Should Be At Least    DataReads    ${MIN_TICKS}
    Counter Should Be At Least    SoftResets    1
    ${power}=                 Execute Command    spi1.imu0 PowerManagement
    Should Be Equal As Integers    ${power.strip()}    0x0F

Should Feed Programmed IMU Samples To The Flight Core
    Boot To Control Loop
    Execute Command           spi1.imu0 SetGyroRaw 164 -328 492
    Execute Command           spi1.imu0 SetAccelRaw 10 -20 2040
    Wait For Line On Uart     LOOP \\d+ arm=Disarmed .* gyro=164,-328,492 accel=10,-20,2040 errors=0    treatAsRegex=true

Should Write Idle Duty To Every Motor Timer Channel
    Boot To Control Loop
    Wait For Line On Uart     LOOP ${MIN_TICKS} arm=Disarmed    treatAsRegex=true
    Create Log Tester         1
    Execute Command           sysbus LogPeripheralAccess sysbus.timer3
    Execute Command           sysbus LogPeripheralAccess sysbus.timer5
    Wait For Log Entry        timer3.*WriteUInt(16|32) to 0x3C.*value 0x0\\b    treatAsRegex=true    pauseEmulation=true
    Wait For Log Entry        timer3.*WriteUInt(16|32) to 0x40.*value 0x0\\b    treatAsRegex=true    pauseEmulation=true
    Wait For Log Entry        timer5.*WriteUInt(16|32) to 0x34.*value 0x0\\b    treatAsRegex=true    pauseEmulation=true
    Wait For Log Entry        timer5.*WriteUInt(16|32) to 0x38.*value 0x0\\b    treatAsRegex=true    pauseEmulation=true
    Execute Command           sysbus LogPeripheralAccess sysbus.timer3 false
    Execute Command           sysbus LogPeripheralAccess sysbus.timer5 false
    Motor Timer Should Hold Idle Duty    ${TIM3}    ${CCR3}    ${CCR4}    0x1100    ${CCMR2}    0x6060
    Motor Timer Should Hold Idle Duty    ${TIM5}    ${CCR1}    ${CCR2}    0x0011    ${CCMR1}    0x6060
