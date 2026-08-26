package au.com.assetize.maximotools.mockkit.seam;

/**
 * IBM-free seam for the one {@code psdi.server.MXServer} interaction most
 * business logic needs: looking up an MboSet by name. The profile modules
 * bridge this to a {@code mockStatic(MXServer.class)} JUnit extension.
 */
public interface MaximoServerLike {

    MboSetLike getMboSet(String objectName);
}
