package au.com.assetize.maximotools.mockkit.dictionary;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** One object's attribute dictionary for a specific lens, with fail-closed checks. */
public final class ObjectDef {

    private final String objectName;
    private final String lens;
    private final Map<String, AttributeDef> attributes;
    private final Map<String, Set<String>> domains;

    ObjectDef(String objectName, String lens, List<AttributeDef> attributes,
              Map<String, Set<String>> domains) {
        this.objectName = objectName;
        this.lens = lens;
        this.attributes = attributes.stream()
            .collect(Collectors.toUnmodifiableMap(a -> a.name().toUpperCase(Locale.ROOT), a -> a));
        this.domains = domains;
    }

    public String objectName() {
        return objectName;
    }

    /** Fail closed: an attribute the lens's dictionary does not define throws. */
    public AttributeDef require(String attribute) {
        AttributeDef def = attributes.get(attribute.toUpperCase(Locale.ROOT));
        if (def == null) {
            throw new UnknownAttributeException(objectName, attribute.toUpperCase(Locale.ROOT), lens);
        }
        return def;
    }

    /** Enforce required/length/type/domain rules for a setValue. */
    public void checkSet(String attribute, Object value) {
        AttributeDef def = require(attribute);
        if (value == null) {
            if (def.required()) {
                throw new MboValidationException(
                    def.name() + " is required on " + objectName + " (lens " + lens
                        + ") and cannot be set to null.");
            }
            return;
        }
        if ("INTEGER".equalsIgnoreCase(def.maxType())) {
            if (!(value instanceof Number)) {
                try {
                    Integer.parseInt(String.valueOf(value));
                } catch (NumberFormatException e) {
                    throw new MboValidationException(
                        def.name() + " on " + objectName + " is INTEGER (lens " + lens
                            + "); rejected non-numeric value '" + value + "'.");
                }
            }
        } else {
            String text = String.valueOf(value);
            if (def.length() > 0 && text.length() > def.length()) {
                throw new MboValidationException(
                    def.name() + " on " + objectName + " is limited to " + def.length()
                        + " characters (lens " + lens + "); rejected " + text.length()
                        + "-character value.");
            }
        }
        if (def.domainId() != null) {
            Set<String> allowed = domains.get(def.domainId());
            if (allowed != null && !allowed.contains(String.valueOf(value))) {
                throw new MboValidationException(
                    def.name() + " on " + objectName + " is bound to domain " + def.domainId()
                        + " (lens " + lens + "); '" + value + "' is not among " + allowed + ".");
            }
        }
    }
}
