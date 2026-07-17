/**
 * Tests for /api/supplier route - Query Parameter Validation
 * 
 * Task 1.1: Add query parameter validation to `/api/supplier` route
 * Requirements: 5.4, 5.5
 */

import { GET } from './route';
import { NextResponse } from 'next/server';

// Mock dependencies
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({
      data,
      status: init?.status || 200,
    })),
  },
}));

jest.mock('@/lib/mongodb', () => ({
  __esModule: true,
  default: Promise.resolve({
    db: () => ({
      collection: () => ({
        find: () => ({
          sort: () => ({
            toArray: () => Promise.resolve([]),
          }),
        }),
        findOne: () => Promise.resolve(null),
      }),
    }),
  }),
}));

describe('GET /api/supplier - Query Parameter Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sortBy parameter validation', () => {
    it('should accept "createdAt" as a valid sortBy value', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=createdAt',
      };

      await GET(request);

      // Should not return an error response
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });

    it('should accept "totalMilkQuantity" as a valid sortBy value', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=totalMilkQuantity',
      };

      await GET(request);

      // Should not return an error response
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });

    it('should return 400 error for invalid sortBy parameter', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=invalidField',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortBy parameter'),
        }),
        expect.objectContaining({ status: 400 })
      );
    });

    it('should return 400 error with helpful message for invalid sortBy', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=supplierName',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          error: 'Invalid sortBy parameter. Allowed values: createdAt, totalMilkQuantity',
        },
        { status: 400 }
      );
    });

    it('should default to "createdAt" when sortBy is not provided', async () => {
      const request = {
        url: 'http://localhost/api/supplier',
      };

      await GET(request);

      // Should not return an error response (uses default)
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });
  });

  describe('sortOrder parameter validation', () => {
    it('should accept "asc" as a valid sortOrder value', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortOrder=asc',
      };

      await GET(request);

      // Should not return an error response
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });

    it('should accept "desc" as a valid sortOrder value', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortOrder=desc',
      };

      await GET(request);

      // Should not return an error response
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });

    it('should return 400 error for invalid sortOrder parameter', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortOrder=ascending',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortOrder parameter'),
        }),
        expect.objectContaining({ status: 400 })
      );
    });

    it('should return 400 error with helpful message for invalid sortOrder', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortOrder=invalid',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          error: 'Invalid sortOrder parameter. Allowed values: asc, desc',
        },
        { status: 400 }
      );
    });

    it('should default to "desc" when sortOrder is not provided', async () => {
      const request = {
        url: 'http://localhost/api/supplier',
      };

      await GET(request);

      // Should not return an error response (uses default)
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });
  });

  describe('combined parameter validation', () => {
    it('should accept both valid sortBy and sortOrder parameters', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=totalMilkQuantity&sortOrder=asc',
      };

      await GET(request);

      // Should not return an error response
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });

    it('should validate sortBy before sortOrder (return sortBy error first)', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=invalid&sortOrder=invalid',
      };

      await GET(request);

      // Should return sortBy error (checked first)
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortBy parameter'),
        }),
        { status: 400 }
      );
    });

    it('should work with search parameter alongside valid sort parameters', async () => {
      const request = {
        url: 'http://localhost/api/supplier?search=test&sortBy=totalMilkQuantity&sortOrder=desc',
      };

      await GET(request);

      // Should not return an error response
      const lastCall = NextResponse.json.mock.calls[NextResponse.json.mock.calls.length - 1];
      const [responseData, options] = lastCall;
      expect(options?.status).not.toBe(400);
      expect(responseData.error).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string sortBy parameter as invalid', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortBy parameter'),
        }),
        { status: 400 }
      );
    });

    it('should handle empty string sortOrder parameter as invalid', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortOrder=',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortOrder parameter'),
        }),
        { status: 400 }
      );
    });

    it('should be case-sensitive for sortBy parameter', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=CreatedAt',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortBy parameter'),
        }),
        { status: 400 }
      );
    });

    it('should be case-sensitive for sortOrder parameter', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortOrder=DESC',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortOrder parameter'),
        }),
        { status: 400 }
      );
    });
  });
});
