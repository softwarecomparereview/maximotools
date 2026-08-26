package au.com.assetize.maximotools.mockkit;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import au.com.assetize.maximotools.mockkit.seam.MaximoServerLike;
import au.com.assetize.maximotools.mockkit.seam.MboSetLike;

/**
 * IBM-free stand-in for the {@code MXServer.getMXServer().getMboSet(...)}
 * lookup: register the mocked sets a test needs, hand the server to the code
 * under test through the {@link MaximoServerLike} seam.
 *
 * The profile modules provide the {@code mockStatic(MXServer.class)} JUnit
 * extension that routes real {@code psdi} static lookups here.
 */
public final class MockMaximoServer implements MaximoServerLike {

    private final Map<String, MboSetLike> sets = new HashMap<>();

    public MockMaximoServer register(String objectName, MboSetLike set) {
        sets.put(objectName.toUpperCase(Locale.ROOT), set);
        return this;
    }

    @Override
    public MboSetLike getMboSet(String objectName) {
        MboSetLike set = sets.get(objectName.toUpperCase(Locale.ROOT));
        if (set == null) {
            throw new IllegalStateException(
                "No mocked MboSet registered for " + objectName.toUpperCase(Locale.ROOT)
                    + ". Registered: " + sets.keySet()
                    + ". (Fail-closed: register what the test needs instead of getting an empty default.)");
        }
        return set;
    }
}
