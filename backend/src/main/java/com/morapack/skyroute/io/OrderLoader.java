package com.morapack.skyroute.io;


import java.io.IOException;
import java.nio.file.Path;
import com.morapack.skyroute.models.*;

/**
 * @deprecated Usa {@link Orders} directamente para consumir pedidos. Se mantiene
 *             como adaptador temporal para código existente.
 */
@Deprecated
public class OrderLoader implements AutoCloseable {
    private final Orders delegate;

    private OrderLoader(Orders delegate) {
        this.delegate = delegate;
    }

    public static OrderLoader open(Path path, Airports airports) throws IOException {
        return new OrderLoader(Orders.open(path, airports));
    }

    public Order readNext() throws IOException {
        return delegate.next();
    }

    @Override
    public void close() throws IOException {
        delegate.close();
    }
}