package au.com.assetize.maximotools.mockkit.mas92;

import org.junit.jupiter.api.extension.AfterAllCallback;
import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import psdi.server.MXServer;

/**
 * Handles {@code mockStatic(MXServer.class)} once per test class, so no test
 * repeats the static-mock boilerplate (or forgets to close it and poisons
 * the next class).
 *
 * <pre>{@code
 * @ExtendWith(MXServerMockExtension.class)
 * class MyCustomisationTest {
 *     @Test void logic() throws Exception {
 *         MXServer server = MXServer.getMXServer(); // the static mock
 *         Mockito.when(server.getMboSet("ASSET", null)).thenReturn(...);
 *     }
 * }
 * }</pre>
 */
public final class MXServerMockExtension implements BeforeAllCallback, AfterAllCallback {

    private MockedStatic<MXServer> mockedStatic;
    private MXServer serverMock;

    @Override
    public void beforeAll(ExtensionContext context) {
        serverMock = Mockito.mock(MXServer.class);
        mockedStatic = Mockito.mockStatic(MXServer.class);
        mockedStatic.when(MXServer::getMXServer).thenReturn(serverMock);
    }

    @Override
    public void afterAll(ExtensionContext context) {
        if (mockedStatic != null) {
            mockedStatic.close();
        }
    }
}
