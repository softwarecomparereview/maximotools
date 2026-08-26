package au.com.assetize.maximotools.mockkit.seam;

/**
 * IBM-free seam mirroring the {@code psdi.mbo.MboSet} iteration surface.
 *
 * Cursor semantics follow Maximo's: {@link #moveFirst()} positions at and
 * returns the first row (or {@code null} on an empty set); {@link #moveNext()}
 * advances and returns the next row or {@code null} past the end.
 */
public interface MboSetLike {

    String getName();

    MboLike moveFirst();

    MboLike moveNext();

    MboLike getMbo(int index);

    int count();

    /** Append a new empty row (attributes validated against the dictionary). */
    MboLike add();
}
