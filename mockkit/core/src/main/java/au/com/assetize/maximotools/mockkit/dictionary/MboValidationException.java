package au.com.assetize.maximotools.mockkit.dictionary;

/**
 * Thrown when a setValue violates a required/length/type/domain rule the
 * dictionary records for the active lens.
 */
public class MboValidationException extends RuntimeException {

    public MboValidationException(String message) {
        super(message);
    }
}
