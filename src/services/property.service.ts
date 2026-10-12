import { Property } from '../models/Property.js';
import { IPropertyDocument } from '../types/index.js';

export class PropertyService {
  static async createProperty(data: Partial<IPropertyDocument>): Promise<IPropertyDocument> {
    return Property.create(data);
  }

  static async getProperties(queryString: any) {
    const queryObj = { ...queryString };
    
    // 1. Convert Category automatically
    if (queryObj.category && typeof queryObj.category === 'string') {
      queryObj.category = queryObj.category.toUpperCase();
    }

    // 2. Extract special parameters (Audit Item: Search, Dates, Guests)
    const { search, checkIn, checkOut, guests } = queryObj;

    // 3. Remove all non-DB fields before parsing standard operators
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search', 'checkIn', 'checkOut', 'guests'];
    excludedFields.forEach((el) => delete queryObj[el]);

    // 4. Parse Standard Operators (price gte/lte)
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    const parsedQuery = JSON.parse(queryStr);

    // --- NEW SEARCH ENGINE LOGIC ---

    // 5. Dynamic Text Search: Scans Title, City, and State
    if (search) {
      parsedQuery.$or = [
        { title: { $regex: search,$options: 'i' } },
        { 'address.city': { $regex: search,$options: 'i' } },
        { 'address.state': { $regex: search,$options: 'i' } }
      ];
    }

    // 6. Guest Capacity Filter
    if (guests) {
      parsedQuery['capacity.adults'] = { $gte: parseInt(guests as string, 10) };
    }

    // 7. Date Availability Engine: Only return properties NOT booked for these dates
    if (checkIn && checkOut) {
      const reqStart = new Date(checkIn as string);
      const reqEnd = new Date(checkOut as string);
      
      parsedQuery.isAvailable = true; // Ensure global kill-switch is on
      
      parsedQuery.bookedDates = {
        $not: {
          $elemMatch: {
            startDate: { $lt: reqEnd },
            endDate: { $gt: reqStart }
          }
        }
      };
    }

    // 8. Initialize Query
    let query = Property.find(parsedQuery);

    if (queryString.sort) {
      const sortBy = queryString.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt'); // Default to newest
    }

    // --- STRICT PAGINATION CAPS ---
    const page = parseInt(queryString.page, 10) || 1;
    let limit = parseInt(queryString.limit, 10) || 20;

    // 💡 THE FIX: Strict Cap on limits to prevent Memory Exhaustion DOS attacks
    if (limit > 50) limit = 50; 

    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    // Execute queries in parallel
    const [properties, total] = await Promise.all([
      query,
      Property.countDocuments(parsedQuery)
    ]);

    return { properties, total };
  }

  static async getPropertyById(id: string): Promise<IPropertyDocument | null> {
    // Audit Item 3.3 Security Sync: Exclude email and phone if this service method is used directly
    return Property.findById(id).populate('ownerId', 'firstName lastName profilePicture');
  }

  static async updateProperty(id: string, data: Partial<IPropertyDocument>): Promise<IPropertyDocument | null> {
    return Property.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }
}