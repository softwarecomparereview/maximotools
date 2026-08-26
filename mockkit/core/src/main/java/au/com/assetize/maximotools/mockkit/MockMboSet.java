package au.com.assetize.maximotools.mockkit;

import org.mockito.Mockito;
import org.mockito.invocation.InvocationOnMock;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import au.com.assetize.maximotools.mockkit.dictionary.Dictionary;
import au.com.assetize.maximotools.mockkit.dictionary.ObjectDef;
import au.com.assetize.maximotools.mockkit.seam.MboLike;
import au.com.assetize.maximotools.mockkit.seam.MboSetLike;

/**
 * Fluent builder for a dictionary-honest mocked MboSet.
 *
 * <pre>{@code
 * MboSetLike assets = MockMboSet.of("ASSET", Lens.active())
 *     .row().set("ASSETNUM", "11430").set("SITEID", "BEDFORD").done()
 *     .row().set("ASSETNUM", "11431").set("SITEID", "BEDFORD").done()
 *     .build();
 * }</pre>
 *
 * Every row is a Mockito mock of {@link MboLike} whose Answers read and
 * write a map-backed value store — but only through the captured dictionary
 * for the given lens. Touching an attribute the lens does not define throws
 * {@code UnknownAttributeException}; setValue enforces required, length,
 * type and domain rules. The set mock implements real
 * moveFirst/moveNext/getMbo/count iteration over the rows.
 */
public final class MockMboSet {

    private final String objectName;
    private final ObjectDef def;
    private final List<MboLike> rows = new ArrayList<>();

    private MockMboSet(String objectName, Lens lens) {
        this.objectName = objectName.toUpperCase(Locale.ROOT);
        this.def = Dictionary.forLens(lens).object(objectName);
    }

    public static MockMboSet of(String objectName, Lens lens) {
        return new MockMboSet(objectName, lens);
    }

    public RowBuilder row() {
        return new RowBuilder();
    }

    /** Build the set mock with real iteration over the accumulated rows. */
    public MboSetLike build() {
        List<MboLike> snapshot = rows; // add() appends; keep the live list
        int[] cursor = {-1};
        return Mockito.mock(MboSetLike.class, Mockito.withSettings()
            .name(objectName + "Set")
            .defaultAnswer(invocation -> switch (invocation.getMethod().getName()) {
                case "getName" -> objectName;
                case "count" -> snapshot.size();
                case "moveFirst" -> {
                    cursor[0] = 0;
                    yield snapshot.isEmpty() ? null : snapshot.get(0);
                }
                case "moveNext" -> {
                    cursor[0] += 1;
                    yield cursor[0] < snapshot.size() ? snapshot.get(cursor[0]) : null;
                }
                case "getMbo" -> {
                    int i = invocation.getArgument(0);
                    yield i >= 0 && i < snapshot.size() ? snapshot.get(i) : null;
                }
                case "add" -> {
                    MboLike added = newRowMock(new LinkedHashMap<>());
                    snapshot.add(added);
                    yield added;
                }
                case "toString" -> objectName + "Set(" + snapshot.size() + " rows)";
                default -> throw new UnsupportedOperationException(
                    "MboSetLike." + invocation.getMethod().getName() + " is not stubbed");
            }));
    }

    private MboLike newRowMock(Map<String, Object> store) {
        return Mockito.mock(MboLike.class, Mockito.withSettings()
            .name(objectName + "[" + rows.size() + "]")
            .defaultAnswer(invocation -> answerRow(invocation, store)));
    }

    private Object answerRow(InvocationOnMock invocation, Map<String, Object> store) {
        String method = invocation.getMethod().getName();
        if ("getName".equals(method)) {
            return objectName;
        }
        if ("toString".equals(method)) {
            return objectName + store;
        }
        String attribute = ((String) invocation.getArgument(0)).toUpperCase(Locale.ROOT);
        return switch (method) {
            case "setValue" -> {
                Object value = invocation.getArgument(1);
                def.checkSet(attribute, value);
                store.put(attribute, value);
                yield null;
            }
            case "isNull" -> {
                def.require(attribute);
                yield store.get(attribute) == null;
            }
            case "getString" -> {
                def.require(attribute);
                Object v = store.get(attribute);
                yield v == null ? "" : String.valueOf(v);
            }
            case "getInt" -> {
                def.require(attribute);
                Object v = store.get(attribute);
                yield v == null ? 0
                    : v instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(v));
            }
            case "getDouble" -> {
                def.require(attribute);
                Object v = store.get(attribute);
                yield v == null ? 0.0
                    : v instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(v));
            }
            case "getBoolean" -> {
                def.require(attribute);
                Object v = store.get(attribute);
                yield v != null && (v instanceof Boolean b ? b
                    : v instanceof Number n ? n.intValue() != 0
                    : Boolean.parseBoolean(String.valueOf(v)) || "1".equals(v) || "Y".equals(v));
            }
            default -> throw new UnsupportedOperationException(
                "MboLike." + method + " is not stubbed");
        };
    }

    /** Row builder: values go through the same dictionary checks as setValue. */
    public final class RowBuilder {

        private final Map<String, Object> store = new LinkedHashMap<>();

        public RowBuilder set(String attribute, Object value) {
            String key = attribute.toUpperCase(Locale.ROOT);
            def.checkSet(key, value);
            store.put(key, value);
            return this;
        }

        public MockMboSet done() {
            rows.add(newRowMock(store));
            return MockMboSet.this;
        }
    }
}
