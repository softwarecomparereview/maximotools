package au.com.assetize.maximotools.mockkit;

/**
 * A version lens: the Maximo/MAS release line a piece of evidence (a
 * dictionary, a fixture, a mock behaviour) is proven for — e.g. "9.1",
 * "9.2", or "7.6.1" as a label for classic.
 */
public record Lens(String label) {

    public static final String SYSTEM_PROPERTY = "maximo.lens";

    public Lens {
        if (label == null || label.isBlank()) {
            throw new IllegalArgumentException("Lens label must be non-blank");
        }
    }

    public static Lens of(String label) {
        return new Lens(label);
    }

    /**
     * The lens the test JVM is running under, from {@code -Dmaximo.lens}.
     * Fails closed: no configured lens is an error, not a default.
     */
    public static Lens active() {
        String label = System.getProperty(SYSTEM_PROPERTY);
        if (label == null || label.isBlank()) {
            throw new IllegalStateException(
                "No active version lens: set -D" + SYSTEM_PROPERTY + "=<label> (e.g. 9.1). "
                    + "The kit does not guess which Maximo release line you are testing against.");
        }
        return new Lens(label);
    }
}
