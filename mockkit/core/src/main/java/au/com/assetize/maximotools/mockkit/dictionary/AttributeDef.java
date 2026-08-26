package au.com.assetize.maximotools.mockkit.dictionary;

/** One attribute definition from a captured mxobjectcfg dictionary. */
public record AttributeDef(String name, String maxType, int length, boolean required, String domainId) {
}
