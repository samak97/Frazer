# Razer Barracuda / Barracuda Pro

Decoded from Synapse 4's middleware for products 1339 (Barracuda), 1337 (Barracuda Pro) and their 2024 revisions 1411/1412, downloaded with [`tools/re/fetch-product.ts`](../../tools/re/fetch-product.ts). The driver is in [`mxic_headset.rs`](../../src-tauri/src/hid/drivers/mxic_headset.rs) (`MABEL`, `MABEL_ECR`).

These models use the same `AudioMxicDevice` class as the [BlackShark V2 Pro](blackshark-v2-pro.md). Command codes, reply headers, value encodings and notification records are the same; the command table modules (56555, 42271) are byte-identical in both bundles. Only the points below differ.

## USB IDs

Synapse's product config has a separate `dongleId`. The HyperSpeed dongle enumerates with that id; the control channel is interface 3 (`claimInterface:3`) on all of them.

| Model | Synapse product | Dongle PID | Synapse class |
|---|---|---|---|
| Barracuda (2022) | 0x053B (1339) | 0x053C | `AudioMxicMabelT1` |
| Barracuda Pro (2022) | 0x0539 (1337) | 0x053A | `AudioMxicMabelT1` |
| Barracuda (2024 revision) | 0x0584 (1412) | 0x0584 | `AudioMxicMabelT1_ecr` |
| Barracuda Pro (2024 revision) | 0x0583 (1411) | 0x0583 | `AudioMxicMabelT1_ecr` |

## Framing (`AudioMxicMabelT1` only)

The 2022 models use report 0x01 and a header two bytes shorter:

```
request  01 80 len+5 'P' 'A' type 08 len  data...        (BlackShark: 02 80 len+5 00 00 'P' 'A' type 00 len data...)
reply    01 ?? n     'P' 'I' ...                          (BlackShark: 02 n 'P' 'I' ...)
```

- `type` is 0x08 for normal commands and 0x0E for remote mode (`E1`), as on the BlackShark.
- Synapse doesn't poll GET_REPORT for a 0x4F status; it writes, then reads until the reply arrives.
- Notifications arrive on report 0x02 in the BlackShark layout (`rzHardwareEventsAudioMxicMabelT1Parser`).

The 2024 `_ecr` revision uses the BlackShark framing for commands, and sends notifications on report 0x01 instead.

## EQ

`protocolAudioMabelT1` stores the presets in different slots, and there is no preset group (0x1D) or hardware-EQ switch (0x1E):

| Preset | Barracuda slot | BlackShark slot |
|---|---|---|
| Default | 0 | 0 |
| Game | 1 | 7 |
| Music | 2 | 8 |
| Movie | 3 | 9 |
| Custom | 255 | 255 |

Frazer keeps BlackShark slot numbers everywhere else, so the driver translates them. The esports presets (250–254) and all recommended presets are written as Custom bands.

Synapse doesn't enable `useHardwareEqualizer` for these models; its EQ screen goes through the THX audio driver. Writing Custom bands with 0x95 is supported by the shared base class, but has not been confirmed audible on a real Barracuda yet.

## Notifications

Battery 0x21, charging 0x2A, power 0x20, mic 0x55 and sidetone 0x18, as on the BlackShark. There is no EQ-button record. The Pro also reports ANC status, which Frazer doesn't use yet.

The mic EQ has its own custom bands (`setMicCustomerEQBand`, -10…+10 mapped onto 0…10); Frazer only uses the mic presets.
