import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

function HomePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => productsApi.list({ page: 1 }),
  });

  const products = data?.data?.products || [];
  const featuredProducts = products.slice(0, 4);

  return (
    <div>
      {/* Hero Section */}
      <div className="bg-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Shop the CloudCommerce way</h1>
            <p className="text-xl text-indigo-100 mb-8">
              Discover premium products with cloud-powered reliability
            </p>
            <Link
              to="/products"
              className="inline-block bg-white text-indigo-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition"
            >
              Browse Products
            </Link>
          </div>
        </div>
      </div>

      {/* Featured Products */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Featured Products</h2>
        {isLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <p className="text-gray-500">Unable to load products. Please try again later.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product: any) => (
              <Link
                key={product._id}
                to={`/products/${product._id}`}
                className="bg-white rounded-lg shadow hover:shadow-lg transition p-4 block"
              >
                <div className="bg-gray-200 border-2 border-dashed rounded-lg w-full h-40 mb-4 flex items-center justify-center">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <span className="text-gray-400 text-sm">No Image</span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                <p className="text-indigo-600 font-bold">${(product.price / 100).toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">{product.category}</p>
              </Link>
            ))}
          </div>
        )}
        {products.length === 0 && !isLoading && (
          <p className="text-gray-500 text-center py-8">No products available yet.</p>
        )}
      </div>
    </div>
  );
}

export default HomePage;