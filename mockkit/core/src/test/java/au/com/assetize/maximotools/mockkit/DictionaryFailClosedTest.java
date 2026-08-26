package au.com.assetize.maximotools.mockkit;

import org.junit.jupiter.api.Test;

import au.com.assetize.maximotools.mockkit.dictionary.MboValidationException;
import au.com.assetize.maximotools.mockkit.dictionary.UnknownAttributeException;
import au.com.assetize.maximotools.mockkit.evidence.EvidencedOn;
import au.com.assetize.maximotools.mockkit.seam.MboLike;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The fail-closed dictionary: a mock that returns whatever the test wants is
 * the fastest way to a green suite that proves nothing. These tests pin the
 * refusals — the kit throws where the real release line would.
 */
@EvidencedOn({"9.1", "9.2"})
class DictionaryFailClosedTest {

    private MboLike asset() {
        return MockMboSet.of("ASSET", Lens.active())
            .row().set("ASSETNUM", "11430").set("SITEID", "BEDFORD").done()
            .build().moveFirst();
    }

    @Test
    void unknownAttributeThrowsOnReadAndWrite() {
        MboLike mbo = asset();
        UnknownAttributeException read =
            assertThrows(UnknownAttributeException.class, () -> mbo.getString("NOTAREALFIELD"));
        assertTrue(read.getMessage().contains("does not exist on object ASSET"));
        assertTrue(read.getMessage().contains(Lens.active().label()));
        assertThrows(UnknownAttributeException.class, () -> mbo.setValue("NOTAREALFIELD", "x"));
        assertThrows(UnknownAttributeException.class, () -> mbo.isNull("NOTAREALFIELD"));
    }

    @Test
    void requiredAttributeRejectsNull() {
        MboValidationException e =
            assertThrows(MboValidationException.class, () -> asset().setValue("SITEID", null));
        assertTrue(e.getMessage().contains("SITEID is required"));
    }

    @Test
    void lengthLimitFromDictionaryIsEnforced() {
        MboLike mbo = asset();
        String tooLong = "X".repeat(26); // ASSETNUM is UPPER(25) in the synthetic dictionary
        MboValidationException e =
            assertThrows(MboValidationException.class, () -> mbo.setValue("ASSETNUM", tooLong));
        assertTrue(e.getMessage().contains("limited to 25 characters"));
        mbo.setValue("ASSETNUM", "X".repeat(25)); // at the limit is fine
    }

    @Test
    void domainMembershipIsEnforcedWhenDomainValuesAreCaptured() {
        MboLike mbo = asset();
        MboValidationException e =
            assertThrows(MboValidationException.class, () -> mbo.setValue("STATUS", "BANANA"));
        assertTrue(e.getMessage().contains("domain ASSETSTATUS"));
        mbo.setValue("STATUS", "OPERATING");
        assertEquals("OPERATING", mbo.getString("STATUS"));
    }

    @Test
    void integerTypeIsEnforced() {
        MboLike wo = MockMboSet.of("WORKORDER", Lens.active())
            .row().set("WONUM", "1001").set("STATUS", "APPR").done()
            .build().moveFirst();
        assertThrows(MboValidationException.class, () -> wo.setValue("WOPRIORITY", "high"));
        wo.setValue("WOPRIORITY", 1);
        assertEquals(1, wo.getInt("WOPRIORITY"));
    }

    @Test
    void unmockedObjectFailsClosed() {
        IllegalStateException e = assertThrows(IllegalStateException.class,
            () -> MockMboSet.of("NOTANOBJECT", Lens.active()));
        assertTrue(e.getMessage().contains("not in the dictionary"));
    }

    @Test
    void mockServerLookupFailsClosed() {
        MockMaximoServer server = new MockMaximoServer()
            .register("ASSET", MockMboSet.of("ASSET", Lens.active()).build());
        assertEquals("ASSET", server.getMboSet("asset").getName());
        assertThrows(IllegalStateException.class, () -> server.getMboSet("WORKORDER"));
    }
}
