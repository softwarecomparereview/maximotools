package au.com.assetize.maximotools.mockkit.evidence;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares which version lenses a test's expectations are evidenced for.
 *
 * The {@link EvidenceExtension} reads {@code -Dmaximo.lens}: when the active
 * lens is not among the declared ones the test is skipped loudly (a visible
 * skip, never a silent pass), and a test with no annotation at all fails —
 * an expectation with no evidence claim is not allowed to go green.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface EvidencedOn {

    /** Lens labels the test's expectations are evidenced for, e.g. {"9.1", "9.2"}. */
    String[] value();
}
