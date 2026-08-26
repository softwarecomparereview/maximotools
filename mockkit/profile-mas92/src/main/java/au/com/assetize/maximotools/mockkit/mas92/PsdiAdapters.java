package au.com.assetize.maximotools.mockkit.mas92;

import java.rmi.RemoteException;

import psdi.mbo.MboRemote;
import psdi.mbo.MboSetRemote;
import psdi.util.MXException;

import au.com.assetize.maximotools.mockkit.seam.MboLike;
import au.com.assetize.maximotools.mockkit.seam.MboSetLike;

/**
 * Adapters wrapping real {@code psdi} types in the kit's IBM-free seam, so
 * production code written against {@link MboLike}/{@link MboSetLike} runs
 * unchanged inside Manage.
 *
 * This module compiles only against the JARs you extracted into
 * mockkit/libs/9.2/ (see libs/README.md). Method signatures are checked at
 * compile time against YOUR extracted build — if IBM changed a signature in
 * your interim fix, the compiler tells you here, which is exactly the
 * version bug the kit exists to surface.
 */
public final class PsdiAdapters {

    private PsdiAdapters() {
    }

    public static MboLike adapt(MboRemote mbo) {
        return new MboAdapter(mbo);
    }

    public static MboSetLike adapt(MboSetRemote set) {
        return new MboSetAdapter(set);
    }

    /** Wraps checked psdi exceptions so seam consumers stay signature-free. */
    public static final class MaximoSeamException extends RuntimeException {
        MaximoSeamException(Exception cause) {
            super(cause);
        }
    }

    private record MboAdapter(MboRemote mbo) implements MboLike {

        @Override
        public String getName() {
            try {
                return mbo.getName();
            } catch (RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public String getString(String attribute) {
            try {
                return mbo.getString(attribute);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public int getInt(String attribute) {
            try {
                return mbo.getInt(attribute);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public double getDouble(String attribute) {
            try {
                return mbo.getDouble(attribute);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public boolean getBoolean(String attribute) {
            try {
                return mbo.getBoolean(attribute);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public boolean isNull(String attribute) {
            try {
                return mbo.isNull(attribute);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public void setValue(String attribute, Object value) {
            try {
                mbo.setValue(attribute, String.valueOf(value));
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }
    }

    private record MboSetAdapter(MboSetRemote set) implements MboSetLike {

        @Override
        public String getName() {
            try {
                return set.getName();
            } catch (RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public MboLike moveFirst() {
            try {
                MboRemote mbo = set.moveFirst();
                return mbo == null ? null : new MboAdapter(mbo);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public MboLike moveNext() {
            try {
                MboRemote mbo = set.moveNext();
                return mbo == null ? null : new MboAdapter(mbo);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public MboLike getMbo(int index) {
            try {
                MboRemote mbo = set.getMbo(index);
                return mbo == null ? null : new MboAdapter(mbo);
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public int count() {
            try {
                return set.count();
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }

        @Override
        public MboLike add() {
            try {
                return new MboAdapter(set.add());
            } catch (MXException | RemoteException e) {
                throw new MaximoSeamException(e);
            }
        }
    }
}
