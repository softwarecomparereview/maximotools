package au.com.assetize.maximotools.mockkit.dictionary;

/**
 * Thrown when a test touches an attribute the active lens's dictionary does
 * not define — mirroring Maximo's attribute-does-not-exist error, so a mock
 * cannot silently accept a field the real release line would reject.
 */
public class UnknownAttributeException extends RuntimeException {

    public UnknownAttributeException(String objectName, String attribute, String lens) {
        super("Attribute " + attribute + " does not exist on object " + objectName
            + " in the dictionary for lens " + lens
            + ". (Fail-closed: if the attribute is real for this release line,"
            + " capture the lens with capture/capture.mjs and point maximo.dictionaries at it.)");
    }
}
