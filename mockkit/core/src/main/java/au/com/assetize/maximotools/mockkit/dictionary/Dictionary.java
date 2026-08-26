package au.com.assetize.maximotools.mockkit.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import au.com.assetize.maximotools.mockkit.Lens;

/**
 * Loads the captured attribute dictionary (mxobjectcfg.json, plus the
 * optional domains.json) for a lens from the dictionaries root named by
 * {@code -Dmaximo.dictionaries}.
 *
 * Fail-closed: a missing root, a missing lens directory, or an object the
 * dictionary does not describe are errors, never silent defaults. Generate
 * real dictionaries with capture/capture.mjs; the committed
 * dictionaries/_synthetic samples exist only so the kit runs out of the box.
 */
public final class Dictionary {

    public static final String ROOT_PROPERTY = "maximo.dictionaries";

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Map<String, Dictionary> CACHE = new ConcurrentHashMap<>();

    private final String lens;
    private final Map<String, List<AttributeDef>> objects;
    private final Map<String, Set<String>> domains;

    private Dictionary(String lens, Map<String, List<AttributeDef>> objects,
                       Map<String, Set<String>> domains) {
        this.lens = lens;
        this.objects = objects;
        this.domains = domains;
    }

    public static Dictionary forLens(Lens lens) {
        return CACHE.computeIfAbsent(lens.label(), Dictionary::load);
    }

    /** Test hook: drop cached dictionaries (e.g. after changing the root property). */
    public static void resetCache() {
        CACHE.clear();
    }

    public ObjectDef object(String objectName) {
        List<AttributeDef> defs = objects.get(objectName.toUpperCase(Locale.ROOT));
        if (defs == null) {
            throw new IllegalStateException(
                "Object " + objectName.toUpperCase(Locale.ROOT)
                    + " is not in the dictionary for lens " + lens
                    + ". Known objects: " + objects.keySet()
                    + ". (Fail-closed: capture the lens rather than mocking an unevidenced object.)");
        }
        return new ObjectDef(objectName.toUpperCase(Locale.ROOT), lens, defs, domains);
    }

    private static Dictionary load(String lensLabel) {
        String root = System.getProperty(ROOT_PROPERTY);
        if (root == null || root.isBlank()) {
            throw new IllegalStateException(
                "No dictionaries root: set -D" + ROOT_PROPERTY + "=<path> "
                    + "(the directory capture/capture.mjs writes, or dictionaries/_synthetic).");
        }
        Path lensDir = Path.of(root, lensLabel);
        Path cfg = lensDir.resolve("mxobjectcfg.json");
        if (!Files.isRegularFile(cfg)) {
            throw new IllegalStateException(
                "No dictionary for lens " + lensLabel + ": " + cfg + " does not exist. "
                    + "Capture it with: node capture/capture.mjs " + lensLabel);
        }
        try {
            JsonNode payload = payload(MAPPER.readTree(cfg.toFile()));
            Map<String, List<AttributeDef>> objects = new HashMap<>();
            for (JsonNode member : payload.path("member")) {
                String objectName = member.path("objectname").asText("").toUpperCase(Locale.ROOT);
                if (objectName.isEmpty()) {
                    continue;
                }
                List<AttributeDef> defs = new ArrayList<>();
                for (JsonNode attr : member.path("attributes")) {
                    defs.add(new AttributeDef(
                        attr.path("attributename").asText().toUpperCase(Locale.ROOT),
                        attr.path("maxtype").asText("ALN"),
                        attr.path("length").asInt(0),
                        attr.path("required").asBoolean(false),
                        attr.hasNonNull("domainid") ? attr.get("domainid").asText() : null));
                }
                objects.put(objectName, List.copyOf(defs));
            }

            Map<String, Set<String>> domains = new HashMap<>();
            Path domainsFile = lensDir.resolve("domains.json");
            if (Files.isRegularFile(domainsFile)) {
                JsonNode domainPayload = payload(MAPPER.readTree(domainsFile.toFile()));
                domainPayload.fields().forEachRemaining(entry -> {
                    Set<String> values = new HashSet<>();
                    entry.getValue().forEach(v -> values.add(v.asText()));
                    domains.put(entry.getKey(), Set.copyOf(values));
                });
            }
            return new Dictionary(lensLabel, Map.copyOf(objects), Map.copyOf(domains));
        } catch (IOException e) {
            throw new IllegalStateException("Unreadable dictionary for lens " + lensLabel, e);
        }
    }

    /** Capture output wraps responses as {_provenance, payload}; accept bare payloads too. */
    private static JsonNode payload(JsonNode doc) {
        return doc.has("payload") ? doc.get("payload") : doc;
    }
}
