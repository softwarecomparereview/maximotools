package au.com.assetize.maximotools.mockkit.seam;

/**
 * IBM-free seam mirroring the {@code psdi.mbo.Mbo} surface the kit mocks.
 *
 * Code under test written against this interface (or adapted to it) needs no
 * IBM JARs to unit-test. The profile modules provide adapters that wrap real
 * {@code psdi} types in this interface for integration seams.
 */
public interface MboLike {

    String getName();

    String getString(String attribute);

    int getInt(String attribute);

    double getDouble(String attribute);

    boolean getBoolean(String attribute);

    boolean isNull(String attribute);

    void setValue(String attribute, Object value);
}
