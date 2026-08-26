# mockkit/libs — extracted IBM Manage JARs (never committed)

This directory holds the IBM-licensed Manage JARs the `profile-mas91` /
`profile-mas92` modules compile against. **It is gitignored and must stay
that way**: the JARs are IBM-licensed binaries and this repository is
public. Committing them, ever, is a licence violation — the `.gitignore`
entry is a guard rail, not a suggestion.

## Layout

```
mockkit/libs/
├── 9.1/
│   ├── businessobjects.jar     <- activates the mas91 profile
│   ├── <supporting libs>.jar
│   └── version.properties      <- provenance you record (see below)
└── 9.2/
    └── ... same shape
```

The Maven profiles activate on `libs/<lens>/businessobjects.jar` existing;
with this directory empty, `mvn verify` builds only the IBM-free `core`
module.

## Extracting from a MAS Manage admin pod

On an OpenShift cluster running MAS Manage, the JARs live in the Manage
admin (maxinst) pod. From a workstation with `oc` logged in:

```bash
NS=mas-<instance>-manage                       # your Manage namespace
POD=$(oc -n "$NS" get pods -o name | grep -m1 -E 'manage-(admin|maxinst)')

# businessobjects.jar plus the supporting libraries:
oc -n "$NS" cp "${POD#pod/}:/opt/IBM/SMP/maximo/applications/maximo/businessobjects/classes" ./classes-tmp 2>/dev/null \
  || oc -n "$NS" cp "${POD#pod/}:/opt/IBM/SMP/maximo/deployment/was/maximo.ear" ./maximo.ear

# Exact paths vary by MAS release — locate them with:
oc -n "$NS" exec "${POD#pod/}" -- find /opt/IBM -name 'businessobjects.jar' 2>/dev/null
```

Copy `businessobjects.jar` (and any supporting JARs your customisation code
needs, e.g. the icu/commons libraries alongside it) into `libs/<lens>/`.

## Recording provenance

Record where each extraction came from, so mock behaviour stays tied to an
evidenced release line. In `libs/<lens>/version.properties`:

```properties
# Build string as reported by /oslc/systeminfo (or the About dialog)
build.string=9.1.x-<build>
source.host=<cluster/instance you extracted from>
extracted.date=2026-08-26
extracted.by=<you>
```

The build string should match the `buildString` recorded in
`dictionaries/<lens>/systeminfo.json` by the capture pipeline — if they
disagree, your mocks and your dictionaries are describing two different
Maximos.
