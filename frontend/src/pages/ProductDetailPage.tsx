import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi, cartApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [quantity] = useState(1);
  const [addedMessage, setAddedMessage] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: !!id,
  });

  const addToCartMutation = useMutation({
    mutationFn: () => cartApi.addItem(token!, id!, quantity),
    onSuccess: () => {
      setAddedMessage('Added to cart!');
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      setTimeout(() => setAddedMessage(''), 3000);
    },
    onError: (err: any) => {
      if (err?.unauthorized) {
        navigate('/login');
      }
    },
  });

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    addToCartMutation.mutate();
  };

  if (isLoading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-red-600">Failed to load product. Please try again.</p>
        <Link to="/products" className="text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
          Back to Products
        </Link>
      </div>
    );
  }

  const product = data?.data;

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-500">Product not found.</p>
        <Link to="/products" className="text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/products" className="text-indigo-600 hover:text-indigo-700 mb-4 inline-block">
        Back to Products
      </Link>

      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="md:flex">
          <div className="md:w-1/2">
            <div className="bg-gray-200 border-2 border-dashed rounded-none w-full h-96 flex items-center justify-center">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-400">No Image</span>
              )}
            </div>
          </div>

          <div className="md:w-1/2 p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
            <span className="inline-block bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded mb-4">
              {product.category}
            </span>
            <p className="text-3xl font-bold text-indigo-600 mb-4">
              ${(product.price / 100).toFixed(2)}
            </p>
            <p className="text-gray-600 mb-6">{product.description || 'No description available.'}</p>

            <div className="mb-6">
              <p className={`text-sm font-medium ${product.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {product.stock > 0 ? `${product.stock} items in stock` : 'Out of stock'}
              </p>
            </div>

            {addedMessage && (
              <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
                {addedMessage}
              </div>
            )}

            <button
              onClick={handleAddToCart}
              disabled={product.stock === 0 || addToCartMutation.isPending}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 transition"
            >
              {addToCartMutation.isPending ? 'Adding...' : 'Add to Cart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailPage;