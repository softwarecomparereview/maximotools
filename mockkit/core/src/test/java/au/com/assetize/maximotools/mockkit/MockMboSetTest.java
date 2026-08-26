package au.com.assetize.maximotools.mockkit;

import org.junit.jupiter.api.Test;

import au.com.assetize.maximotools.mockkit.dictionary.UnknownAttributeException;
import au.com.assetize.maximotools.mockkit.evidence.EvidencedOn;
import au.com.assetize.maximotools.mockkit.seam.MboLike;
import au.com.assetize.maximotools.mockkit.seam.MboSetLike;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EvidencedOn({"9.1", "9.2"})
class MockMboSetTest {

    private MboSetLike assets() {
        return MockMboSet.of("ASSET", Lens.active())
            .row().set("ASSETNUM", "11430").set("SITEID", "BEDFORD")
                  .set("STATUS", "OPERATING").set("DESCRIPTION", "Centrifugal pump").done()
            .row().set("ASSETNUM", "11431").set("SITEID", "BEDFORD")
                  .set("STATUS", "NOT READY").done()
            .build();
    }

    @Test
    void iteratesWithRealCursorSemantics() {
        MboSetLike set = assets();
        assertEquals(2, set.count());

        MboLike first = set.moveFirst();
        assertEquals("11430", first.getString("ASSETNUM"));
        MboLike second = set.moveNext();
        assertEquals("11431", second.getString("assetnum")); // case-insensitive, like Maximo
        assertNull(set.moveNext(), "past the end returns null");

        assertEquals("11430", set.getMbo(0).getString("ASSETNUM"));
        assertNull(set.getMbo(7));
    }

    @Test
    void valueStoreBehavesLikeAnMbo() {
        MboSetLike set = assets();
        MboLike full = set.moveFirst();
        MboLike sparse = set.moveNext();

        assertFalse(full.isNull("DESCRIPTION"));
        assertTrue(sparse.isNull("DESCRIPTION"), "unset attribute reads as null");
        assertEquals("", sparse.getString("DESCRIPTION"), "getString on null returns empty, like Maximo");

        full.setValue("DESCRIPTION", "Rebuilt pump");
        assertEquals("Rebuilt pump", full.getString("DESCRIPTION"));
        assertEquals("ASSET", full.getName());
    }

    @Test
    void addAppendsADictionaryCheckedRow() {
        MboSetLike set = assets();
        MboLike added = set.add();
        assertEquals(3, set.count());
        added.setValue("ASSETNUM", "11500");
        assertEquals("11500", set.getMbo(2).getString("ASSETNUM"));
        assertThrows(UnknownAttributeException.class, () -> added.setValue("NO_SUCH_FIELD", "x"));
    }

    /**
     * The lens-divergent expectation from the field guide: one test, two
     * expectation blocks keyed by lens. ASSETTYPE exists in the synthetic
     * 9.2 dictionary but not in 9.1 — the same code must pass under both
     * lenses with different, evidenced expectations.
     */
    @Test
    void assetTypeDivergesBetweenLenses() {
        MboLike mbo = assets().moveFirst();
        String lens = Lens.active().label();
        if ("9.2".equals(lens)) {
            mbo.setValue("ASSETTYPE", "PRODUCTION");
            assertEquals("PRODUCTION", mbo.getString("ASSETTYPE"));
        } else {
            assertThrows(UnknownAttributeException.class,
                () -> mbo.setValue("ASSETTYPE", "PRODUCTION"),
                "lens " + lens + " has no ASSETTYPE — the mock must refuse it like the real MBO would");
        }
    }
}
