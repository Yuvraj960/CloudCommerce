import mongoose, { Schema, Model } from 'mongoose';

interface IProductDoc {
  name: string;
  description: string;
  price: number;      // cents
  category: string;
  stock: number;
  imageKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Mongoose model type
export type ProductDoc = Model<IProductDoc>;

// API response shape — id is string (vs _id ObjectId in DB), imageKey hidden
export interface ProductResponse {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

const ProductSchema = new Schema<IProductDoc, ProductDoc>(
  {
    name:        { type: String, required: true, maxlength: 255 },
    description: { type: String, maxlength: 2000, default: '' },
    price:       { type: Number, required: true, min: 0 },
    category:    { type: String, required: true, maxlength: 100 },
    stock:       { type: Number, default: 0, min: 0 },
    imageKey:    { type: String, default: null },
  },
  { timestamps: true }
);

// Index for text search on name + description
ProductSchema.index({ name: 'text', description: 'text' });

export const ProductModel = mongoose.model<IProductDoc, ProductDoc>('Product', ProductSchema);