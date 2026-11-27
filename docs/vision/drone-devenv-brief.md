# Brief: środowisko deweloperskie do budowy własnego drona

**Status:** materiał wejściowy do analizy. Nie ma tu decyzji.
**Data:** 2026-11-27
**Pochodzenie:** podsumowanie rozmowy z właścicielem projektu: stan wiedzy, jego wizja i miejsca, gdzie jedno styka się z drugim.

---

## 0. Instrukcja dla agenta, który to czyta

- Twoim zadaniem jest **analiza**, nie implementacja. Zaproponuj warianty i wskaż kompromisy, ryzyka oraz pytania do właściciela.
- Rzeczy oznaczone jako **„sugestia z rozmowy”** padły w dyskusji, ale **nie są zatwierdzone**. Traktuj je jako hipotezy do weryfikacji.
- Wszystko w sekcjach 5 i 6 jest **otwarte**. Nie przyjmuj żadnej z tych opcji za domyślną bez uzasadnienia.
- Jeśli czegoś brakuje do sensownej analizy, zbierz to w pytaniach do właściciela zamiast zgadywać.

---

## 1. Wizja właściciela (przeredagowana)

1. **Bardzo dobre środowisko deweloperskie** do rozwijania własnego oprogramowania drona, od zera, z własnym softem.
2. **Testy na komponentach jak najbliższych rzeczywistości**: symulowane i emulowane odpowiedniki prawdziwych płytek, czujników i napędów.
3. **Przejście do realu**: części drukowane w 3D, montaż, i zachowanie fizycznego drona możliwie bliskie temu z symulacji.
4. **Rozwój prowadzą głównie agenci AI**, którzy piszą kod:
   - wszystko żyje w **repozytorium**,
   - agent (np. pracujący w T3 Code) ma **dostęp do całości**,
   - agent ma **łatwy dostęp do diagnostyki**: logów, telemetrii, wyników testów, stanu symulacji.
5. **Osobny klient graficzny**, w którym da się wszystko wyklikać: wybrać płytkę, sprawdzić połączenie, podejrzeć czujniki i tym podobne. Cel jest ambitny.
6. **Własne silniki symulacyjne**: fizyka, środowisko, prąd i bateria, czujniki, emulacja płytek. Szczegóły w sekcji 2.

---

## 2. Co ustaliliśmy w rozmowie (stan wiedzy)

### 2.1 Typy platform

|                             | Quadcopter                                                      | Płatowiec                                                                          | VTOL (quadplane / tiltrotor / tailsitter)             |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Zawis                       | tak                                                             | nie                                                                                | tak                                                   |
| Czas lotu                   | ~15–35 min                                                      | ~1–3 h+                                                                            | ~1–2 h                                                |
| Złożoność softu             | najniższa (kaskada PID, mixer)                                  | średnia (TECS, nawigacja L1/NPFG, czujnik prędkości powietrza)                     | najwyższa (oba zestawy plus maszyna stanów tranzycji) |
| Złożoność modelu fizycznego | niska (bryła 6DOF, ciąg k·ω², moment śmigieł, dynamika silnika) | wysoka (współczynniki aero CL/CD/Cm(α), stall, potrzebne dane z XFLR5/AVL/OpenVSP) | najwyższa (oba modele plus interakcja rotor–skrzydło) |

_Sugestia z rozmowy:_ zacząć od quadcoptera, a VTOL jako naturalne rozszerzenie później. **Niezatwierdzone.**

### 2.2 Istniejące symulatory i narzędzia (referencja, źródła modeli, ewentualne backendy)

- Ogólne: [Gazebo](https://gazebosim.org) (+ [integracja PX4](https://docs.px4.io/main/en/sim_gazebo_gz/), [modele PX4](https://docs.px4.io/main/en/sim_gazebo_gz/vehicles.html)), [ArduPilot SITL](https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html), [Webots](https://cyberbotics.com)
- Fizyka i RL: [MuJoCo](https://mujoco.org) ([Skydio X2](https://github.com/google-deepmind/mujoco_menagerie/tree/main/skydio_x2)), [gym-pybullet-drones](https://github.com/utiasDSL/gym-pybullet-drones), [Aerial Gym](https://github.com/ntnu-arl/aerial_gym_simulator), [Flightmare](https://github.com/uzh-rpg/flightmare)
- Fotorealizm i wizja: [Isaac Sim](https://developer.nvidia.com/isaac/sim) + [Pegasus](https://github.com/PegasusSimulator/PegasusSimulator), [Colosseum](https://github.com/CodexLabsLLC/Colosseum), [Project AirSim](https://github.com/iamaisim/ProjectAirSim), [AirSim (archiwum)](https://github.com/microsoft/AirSim)
- Aerodynamika i dane: [JSBSim](https://github.com/JSBSim-Team/jsbsim), [XFLR5](https://www.xflr5.tech), [AVL](https://web.mit.edu/drela/Public/web/avl/), [OpenVSP](https://openvsp.org), [UIUC Propeller DB](https://m-selig.ae.illinois.edu/props/propDB.html)
- Płatne: [MATLAB UAV Toolbox](https://www.mathworks.com/products/uav.html)

### 2.3 Koncepcja własnego symulatora: moduły

| Moduł                 | Zakres                                                                                                            | Ocena trudności z rozmowy             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Dynamika 6DOF         | bryła sztywna, kwaterniony, integrator (np. RK4), prosty kontakt z ziemią (sprężyna z tłumieniem)                 | łatwe                                 |
| Silnik + śmigło + ESC | ciąg i moment ~ω², stała czasowa, pobór prądu                                                                     | łatwe/średnie                         |
| Bateria / prąd        | model zastępczy (np. Thevenin): OCV(SoC), opór wewnętrzny, spadek napięcia pod obciążeniem                        | średnie                               |
| Środowisko / pogoda   | atmosfera (np. ISA), wiatr, porywy, turbulencja (np. model Drydena)                                               | średnie                               |
| Czujniki              | IMU, baro, GPS, magnetometr; szum, dryf biasu, częstotliwości, opóźnienia, zakłócenia (np. mag od prądu silników) | średnie, tu jest najwięcej szczegółów |
| Aerodynamika płatowca | modele współczynnikowe, stall                                                                                     | trudne, zależy od danych              |

Wnioski z rozmowy:

- Silnik fizyki ogólnego przeznaczenia (kolizje wielu ciał, przeguby) nie wydaje się potrzebny do lotu, bo dron to jedna bryła sztywna. **Do weryfikacji**, np. czy symulacja crashy, podwozia albo ładunku na linie zmienia ten wniosek.
- **Najtrudniejsze są parametry, nie kod**: hamownia (ciąg i prąd), momenty bezwładności (CAD albo wahadło bifilarne) i **identyfikacja systemu** na podstawie logów z prawdziwych lotów.

### 2.4 Zasady architektoniczne omówione w rozmowie (hipotezy)

- **Rdzeń symulacji bez GUI (headless)**, uruchamiany jako osobny proces.
- **Stały krok czasu** (np. fizyka 1 kHz, czujniki z własnymi częstotliwościami).
- **Lockstep**: symulator jest jedynym zegarem, a firmware i emulator przesuwają czas na jego polecenie.
- **Determinizm**: szum z generatora z ziarnem, dzięki czemu przebieg da się odtworzyć.
- **Logowanie wszystkiego i odtwarzanie przebiegów.**
- **Granica HAL** w firmware (`read_imu()`, `set_motor()`, `read_adc()`…).
- **Jeden protokół** symulator ↔ firmware („odczyty czujników → przesuń czas o dt → komendy silników”) i za nim **wymienne backendy**:

| Backend               | Co uruchamia                    | Do czego                                         |
| --------------------- | ------------------------------- | ------------------------------------------------ |
| SITL natywny          | firmware skompilowany na PC     | szybkie iteracje, testy automatyczne, RL         |
| Emulacja MCU (Renode) | ten sam `.elf` co na płytce     | sterowniki, przerwania, DMA, RTOS, start systemu |
| HIL                   | prawdziwa płytka przez UART/USB | timing i realny sprzęt                           |

### 2.5 Interfejs graficzny: omówione opcje

- Zasada z rozmowy: **grafika jest klientem rdzenia i nie liczy fizyki**. Fizyka silników gier (Unity, Unreal) nie służy do dynamiki lotu.
- Opcje od najtańszej:
  - [Rerun](https://rerun.io) albo [Foxglove](https://foxglove.dev): gotowy podgląd 3D i wykresy,
  - QGroundControl przez MAVLink,
  - Rust: egui (+ wgpu albo three-d),
  - Rust: Bevy (+ bevy_egui),
  - web: Three.js + React w Tauri albo Electronie,
  - Godot,
  - Unity lub Unreal (+ Cesium), tylko jeśli potrzebny jest realistyczny obraz kamery.
- _Sugestia z rozmowy:_ zacząć od Rerun, własny klient później, Unity lub Unreal dopiero przy wizji komputerowej. **Niezatwierdzone.**

### 2.6 Emulacja płytek (STM32) w Renode

- [Renode](https://renode.io) uruchamia prawdziwy firmware (`.elf`) na emulowanym MCU.
- [External Control API](https://renode.readthedocs.io/en/latest/api-description/external-control.html) (`renode_connect`, `renode_run_for`, `renode_get_current_time`) pozwala sterować czasem z zewnątrz, czyli zrobić lockstep z symulatorem.
- Modele czujników i peryferiów pisze się w C# ([poradnik](https://renode.readthedocs.io/en/latest/advanced/writing-peripherals.html), [czujniki](https://renode.readthedocs.io/en/latest/basic/sensors.html)). Płytkę opisuje plik `.repl`.
- Komendy silników można czytać np. z rejestrów CCR timerów albo przez UART.
- Wsparcie MCU jest częściowe i [lista płytek](https://renode.readthedocs.io/en/latest/introduction/supported-boards.html) jest niepełna. Są na niej m.in. STM32F4 (Discovery, F429, F412) oraz STM32H743 i H753. Modele mają luki, np. [brak CCM na F4 Discovery według NuttX](https://nuttx.apache.org/docs/latest/guides/renode.html).
- **Renode nie jest emulatorem cyklicznie dokładnym.** Sprawdza logikę, ale nie realny timing.
- Zephyr ma [płytki pod Renode](https://docs.zephyrproject.org/latest/boards/renode/index.html), np. [STM32H7 Renode Reference Board](https://docs.zephyrproject.org/latest/boards/antmicro/stm32h7_renode_reference_board/doc/index.html).

---

## 3. Wizja a stan wiedzy: zestawienie

| Element wizji                                    | Co z rozmowy już tu pasuje                                            | Czego brakuje (luka)                                                                                                                                                                                                                                                                                   | Pytania otwarte                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Testy na komponentach jak najbliższych realu     | trzy backendy (SITL, Renode, HIL); modele czujników z szumem i biasem | **katalog realnych komponentów** (cyfrowy bliźniak listy części): konkretne IMU, baro, silniki, śmigła, ESC, baterie, każdy z parametrami z datasheetu lub pomiarów i z odpowiednikami w symulatorze i w Renode                                                                                        | Jak mierzyć „bliskość realu”? Jakie metryki i progi? Ile poziomów wierności?                                        |
| Druk 3D, montaż, zachowanie jak w symulacji      | masa i bezwładność z CAD; hamownia; identyfikacja systemu             | **CAD w repozytorium** z automatycznym przepływem CAD → parametry symulacji (masa, środek masy, tensor bezwładności, geometria); wpływ drukowanej ramy (sztywność, rezonanse, drgania na IMU); materiały i tolerancje; pętla „lot → logi → strojenie modelu”                                           | CAD jako kod czy CAD z GUI? Czy modelować drgania ramy? Kto i jak robi pomiary?                                     |
| Agenci AI piszą kod, wszystko w repo             | rdzeń bez GUI, determinizm, logi, testy automatyczne w SITL           | **repo projektowane pod agentów**: instrukcje dla agentów, CLI do wszystkiego, wyjścia czytelne maszynowo (np. JSON), scenariusze testowe jako CI, odtwarzalne środowisko; **bezpieczeństwo**: agent nie wgrywa firmware'u i nie uzbraja silników na prawdziwym sprzęcie bez zgody człowieka           | Monorepo czy wiele repozytoriów? Jaki system budowania? Jak agent dostaje się do symulatora (CLI, API, serwer MCP)? |
| Łatwa diagnostyka dla agenta                     | logowanie i odtwarzanie, Rerun, GDB w Renode                          | **ujednolicony schemat telemetrii i logów**, przeszukiwalny przez agenta; automatyczne podsumowania przebiegów; asercje i metryki w scenariuszach; zrzuty stanu firmware'u przy błędach                                                                                                                | Format logów? Jak agent ma pytać o przebieg („co się stało w 12. sekundzie”)?                                       |
| Osobny klient graficzny, wszystko do wyklikania  | opcje GUI z sekcji 2.5; zasada „GUI jako klient rdzenia”              | **zasada parytetu**: to, co da się wyklikać, agent może wywołać przez API lub CLI, i odwrotnie; konfiguracja jako pliki w repo, więc zmiany z GUI widać w gicie; widoki: menedżer urządzeń, podgląd czujników na żywo, kalibracja, parametry, wgrywanie firmware'u, edytor scenariuszy (wiatr, awarie) | Technologia GUI? Jak daleko sięga „wszystko wyklikać”? Co w pierwszej wersji?                                       |
| Wybór płytki, sprawdzenie połączenia i czujników | HAL; `.repl` w Renode; HIL                                            | **jeden plik opisu sprzętu** (MCU, piny, magistrale, czujniki, adresy) jako źródło prawdy, z którego powstają: konfiguracja firmware'u, `.repl` dla Renode, konfiguracja czujników w symulatorze i widoki w GUI; kreator uruchamiania nowej płytki; realne połączenia (USB, UART, programator SWD)     | Własne PCB czy gotowy kontroler lotu? Jedna płytka czy rodzina płytek?                                              |
| Silniki fizyczne, środowisko, prąd               | moduły z sekcji 2.3                                                   | **decyzja „piszemy sami czy bierzemy gotowe” osobno dla każdego modułu**; strategia walidacji każdego modułu względem pomiarów                                                                                                                                                                         | Gdzie gotowe rozwiązanie (MuJoCo, JSBSim, Gazebo) wygrywa z własnym?                                                |

---

## 4. Szkic warstw systemu (do weryfikacji, nie decyzja)

```
┌───────────────────────────────────────────────────────────────────┐
│ Repozytorium (źródło prawdy, w nim pracują agenci AI)             │
│                                                                   │
│  Opis sprzętu / BOM ──┬─► CAD (rama, części do druku 3D)          │
│  (płytki, czujniki,   │      └─► masa, środek masy, bezwładność ─┐│
│   napędy, baterie)    │                                          ││
│                       ├─► konfiguracja firmware'u                ││
│                       ├─► opis płytki dla emulatora (.repl)      ││
│                       └─► konfiguracja modeli w symulatorze ◄────┘│
│                                                                   │
│  Rdzeń symulacji (headless): 6DOF, napęd, bateria, środowisko,    │
│  czujniki ◄── jeden protokół ──► backendy: SITL / Renode / HIL    │
│                                            └── firmware (HAL)     │
│                                                                   │
│  Telemetria i logi (wspólny schemat) ──► odtwarzanie, analiza     │
│                                                                   │
│  API sterowania (CLI / API / ew. MCP) ◄── agenci AI               │
│          ▲                                                        │
│          └── klient graficzny (parytet z API)                     │
│                                                                   │
│  Testy i CI: scenariusze, asercje, regresja na SITL (i Renode?)   │
└───────────────────────────────────────────────────────────────────┘
          │ przejście do realu
          ▼
  Druk 3D + montaż → hamownia / pomiary → loty → logi
        → identyfikacja systemu → strojenie modeli w repo
```

---

## 5. Otwarte decyzje (opcje znane z rozmowy; wybór należy do analizy i właściciela)

| Obszar                        | Opcje, które padły lub są oczywiste                                                                                                 | Czynniki                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Typ platformy                 | quad / płatowiec / VTOL; etapowanie                                                                                                 | cel drona, złożoność, czas                                           |
| Język rdzenia symulacji       | Python, Rust, C++ (np. prototyp w Pythonie, rdzeń później)                                                                          | wydajność, praca agentów, ekosystem                                  |
| Firmware                      | bare-metal C lub C++, Rust embedded, Zephyr, NuttX; ewentualne wykorzystanie fragmentów PX4, ArduPilot lub Betaflight               | właściciel chce własny soft; wsparcie w Renode                       |
| MCU i płytka                  | rodziny STM32 F4, F7, H7; gotowy kontroler lotu czy własne PCB                                                                      | wsparcie w Renode, dostępność, cena                                  |
| Konkretne czujniki            | IMU, baro, GPS, magnetometr: do wybrania                                                                                            | dostępność modeli w Renode albo koszt ich napisania; datasheety      |
| Protokół symulator ↔ firmware | własny, wiadomości HIL z MAVLinka, protobuf lub flatbuffers, pamięć współdzielona                                                   | lockstep, wydajność, debugowalność                                   |
| Protokół naziemny             | MAVLink (zgodność z QGroundControl) albo własny                                                                                     | ekosystem kontra kontrola                                            |
| Technologia GUI               | Rerun lub Foxglove, egui, Bevy, Tauri lub Electron + Three.js, Godot, Unity lub Unreal                                              | wymagania widoków, parytet z API, język rdzenia                      |
| CAD                           | CAD jako kod albo CAD z GUI (w środowisku właściciela jest dostępny parametryczny CAD sterowany przez agenta: SolidCraft przez MCP) | praca agentów, automatyczny eksport parametrów                       |
| Integracja z agentami         | CLI, lokalne API, serwer MCP z narzędziami symulacji i diagnostyki                                                                  | jak T3 Code i inne narzędzia agentowe z tego korzystają              |
| Repo i budowanie              | monorepo albo wiele repozytoriów; Cargo, CMake, Bazel, Nix, devcontainer                                                            | wiele języków (firmware, rdzeń, GUI, C# dla Renode)                  |
| CI                            | tylko SITL; SITL + Renode; sprzęt w CI                                                                                              | koszty, czas, bezpieczeństwo                                         |
| Wierność symulacji            | jakie zjawiska modelować i na jakim poziomie                                                                                        | definicja „blisko realu”                                             |
| Środowisko uruchomieniowe     | maszyna deweloperska właściciela to macOS; ewentualnie Linux lub chmura                                                             | wsparcie narzędzi na macOS (Gazebo, Renode; Isaac Sim wymaga NVIDIA) |

---

## 6. Pytania do właściciela (jeszcze bez odpowiedzi)

1. Do czego dron ma służyć: hobby, nauka, badania, produkt, ładunek, autonomia na podstawie kamery?
2. Klasa wielkości i masy, budżet, horyzont czasowy.
3. Własne PCB czy gotowy kontroler lotu na początek?
4. Na ile dopuszczalne jest wykorzystanie istniejących autopilotów lub ich części?
5. Co konkretnie znaczy „bliskie rzeczywistości”? Jakie testy porównawcze sim ↔ real mają to potwierdzać?
6. Czy przewidziana jest kamera i wizja komputerowa? To wpływa na grafikę i sprzęt (GPU).
7. Jak ambitny ma być klient graficzny w pierwszej wersji, a jak docelowo?
8. Jakie zasady bezpieczeństwa dla agentów przy prawdziwym sprzęcie (wgrywanie firmware'u, uzbrajanie silników, testy bez śmigieł)?
9. Na jakim sprzęcie i systemie ma działać środowisko (macOS, Linux, GPU)?
10. Przepisy lotnicze, które obowiązują właściciela (np. EASA/ULC, jeśli dotyczy), jako ograniczenie projektu.

---

## 7. Ryzyka i pułapki zauważone w rozmowie

- **Różnica sim ↔ real.** Model jest tak dobry jak jego parametry; bez pomiarów i identyfikacji systemu symulacja potwierdza tylko założenia.
- **Drukowana rama**: drgania i rezonanse wpływają na IMU i strojenie regulatorów.
- **Renode** nie odwzorowuje timingu; modele peryferiów i czujników trzeba utrzymywać samemu.
- **Rozjazd wielu reprezentacji** tego samego sprzętu (firmware, Renode, symulator, GUI) bez jednego źródła prawdy.
- **Rozrost zakresu (scope creep)**: ambitne GUI i wiele backendów naraz.
- **Bezpieczeństwo przy pracy agentów z prawdziwym sprzętem**: kręcące się śmigła, baterie LiPo.
- **Ograniczenia platformy deweloperskiej** (macOS) dla części narzędzi.

---

## 8. Proponowane rezultaty analizy (dla kolejnego agenta)

1. 2–3 **warianty architektury** całego środowiska z kompromisami.
2. Propozycja **struktury repozytorium** pod pracę agentów AI, w tym jak agent uruchamia symulację, testy i diagnostykę.
3. Propozycja **modelu opisu sprzętu** jako jednego źródła prawdy i tego, co z niego generować.
4. **Zakres MVP** i kamienie milowe, od „dron wisi w SITL” do „pierwszy lot fizycznego egzemplarza”.
5. **Strategia walidacji** sim ↔ real: pomiary, stanowiska testowe, metryki.
6. **Rejestr ryzyk** i lista decyzji, które wymagają odpowiedzi właściciela.

Nie zaczynaj implementacji, dopóki właściciel nie zatwierdzi kierunku.
