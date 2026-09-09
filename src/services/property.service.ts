import { Property } from '../models/Property.js';
import { IPropertyDocument } from '../types/index.js';

export class PropertyService {
  static async createProperty(data: Partial<IPropertyDocument>): Promise<IPropertyDocument> {
    return Property.create(data);
  }

  static async getProperties(queryString: any) {
    const queryObj = { ...queryString };
    
    // ✅ THE CRITICAL FIX: Automatically convert the category parameter to uppercase 
    // to match your Mongoose enum settings ('SHORTLET', 'APARTMENT', etc.)
    if (queryObj.category && typeof queryObj.category === 'string') {
      queryObj.category = queryObj.category.toUpperCase();
    }

    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);

    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    
    // Pass the correctly parsed query payload into Mongoose
    let query = Property.find(JSON.parse(queryStr));

    if (queryString.sort) {
      const sortBy = queryString.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    const page = parseInt(queryString.page, 10) || 1;
    const limit = parseInt(queryString.limit, 10) || 20;
    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    const properties = await query;
    const total = await Property.countDocuments(JSON.parse(queryStr));

    return { properties, total };
  }

  static async getPropertyById(id: string): Promise<IPropertyDocument | null> {
    return Property.findById(id).populate('ownerId', 'firstName lastName email');
  }

  static async updateProperty(id: string, data: Partial<IPropertyDocument>): Promise<IPropertyDocument | null> {
    return Property.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }
}
