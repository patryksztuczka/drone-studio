# Telemetry

The record of every flight and the questions people and agents ask of it.

## Language

**Run**:
One recorded flight: its metadata, its sampled telemetry and its events, immutable once written.
_Avoid_: log, session (a live Studio session becomes a run when it stops)

**Run id**:
The run's name: when it was recorded and which scenario it flew.

**Sample**:
One row of a run's telemetry: ground truth, sensor samples, estimates, setpoints, motor commands and battery at one instant.

**Event**:
A timestamped fact in a run, such as arming, a gust starting, saturation or a failed assertion.
_Avoid_: log line

**Assertion**:
A PASS/FAIL condition a scenario states about its flight; a run passes when every assertion does.
_Avoid_: check, expectation

**Summary**:
The metrics of a run reduced to single numbers, such as attitude error RMS or minimum pack voltage.

**Anomaly**:
A time window the analysis flags as suspicious, with a kind, a severity, the channel and a measured value.
_Avoid_: issue, warning (that is a severity)

**Slice**:
A decimated time window of chosen signals from one run.

**Diff**:
The comparison of a baseline run and a candidate run: metric deltas, assertion changes and trajectory differences.
