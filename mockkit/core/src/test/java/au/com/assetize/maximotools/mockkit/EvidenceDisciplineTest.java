package au.com.assetize.maximotools.mockkit;

import org.junit.jupiter.api.Test;

import au.com.assetize.maximotools.mockkit.evidence.EvidencedOn;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The @EvidencedOn discipline, demonstrated on itself. Run the module with
 * -Dmaximo.lens=9.1 and then -Dmaximo.lens=9.2 (the CI matrix does): the
 * lens-specific tests below flip between executing and skipping loudly —
 * never silently passing on a lens they carry no evidence for.
 */
class EvidenceDisciplineTest {

    @Test
    @EvidencedOn({"9.1", "9.2"})
    void activeLensComesFromTheSystemProperty() {
        String label = Lens.active().label();
        assertTrue(label.equals("9.1") || label.equals("9.2"));
        assertEquals(label, System.getProperty(Lens.SYSTEM_PROPERTY));
    }

    @Test
    @EvidencedOn({"9.1"})
    void runsOnlyUnderLens91() {
        // Skipped (loudly) whenever the active lens is not 9.1.
        assertEquals("9.1", Lens.active().label());
    }

    @Test
    @EvidencedOn({"9.2"})
    void runsOnlyUnderLens92() {
        // Skipped (loudly) whenever the active lens is not 9.2.
        assertEquals("9.2", Lens.active().label());
    }
}
