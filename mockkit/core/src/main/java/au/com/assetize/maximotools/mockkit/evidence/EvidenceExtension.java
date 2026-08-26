package au.com.assetize.maximotools.mockkit.evidence;

import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionConfigurationException;
import org.junit.jupiter.api.extension.ExtensionContext;

import java.lang.reflect.AnnotatedElement;
import java.util.Arrays;
import java.util.Optional;

import au.com.assetize.maximotools.mockkit.Lens;

/**
 * Enforces the evidence discipline on every test in the module (registered
 * via JUnit auto-detection, see src/test/resources):
 *
 * <ul>
 *   <li>a test whose {@link EvidencedOn} lenses do not include the active
 *       {@code -Dmaximo.lens} is skipped loudly, with the reason naming both
 *       sides — never silently passed;</li>
 *   <li>a test (or test class) with no {@link EvidencedOn} at all fails:
 *       an expectation that claims no evidence must not go green.</li>
 * </ul>
 */
public final class EvidenceExtension implements ExecutionCondition, BeforeEachCallback {

    @Override
    public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
        Optional<EvidencedOn> annotation = findAnnotation(context);
        if (annotation.isEmpty()) {
            // Leave enabled so beforeEach can FAIL it (a disabled test would
            // be a silent skip, which is exactly what this extension forbids).
            return ConditionEvaluationResult.enabled("no @EvidencedOn — will fail in beforeEach");
        }
        String active = Lens.active().label();
        String[] evidenced = annotation.get().value();
        if (Arrays.asList(evidenced).contains(active)) {
            return ConditionEvaluationResult.enabled("evidenced for lens " + active);
        }
        return ConditionEvaluationResult.disabled(
            "SKIPPED LOUDLY: test is evidenced for lenses " + Arrays.toString(evidenced)
                + " but the active lens is " + active
                + ". Capture evidence for " + active + " and add it to @EvidencedOn"
                + " — do not assume another release line's behaviour transfers.");
    }

    @Override
    public void beforeEach(ExtensionContext context) {
        if (findAnnotation(context).isEmpty()) {
            throw new ExtensionConfigurationException(
                "Test " + context.getDisplayName() + " declares no @EvidencedOn lenses. "
                    + "Every mockkit test must state which Maximo release lines its "
                    + "expectations are evidenced for (e.g. @EvidencedOn({\"9.1\", \"9.2\"})).");
        }
    }

    private static Optional<EvidencedOn> findAnnotation(ExtensionContext context) {
        Optional<EvidencedOn> onMethod = context.getTestMethod()
            .map(m -> (AnnotatedElement) m)
            .map(m -> m.getAnnotation(EvidencedOn.class));
        if (onMethod.isPresent()) {
            return onMethod;
        }
        return context.getTestClass().map(c -> c.getAnnotation(EvidencedOn.class));
    }
}
