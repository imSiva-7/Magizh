/**
 * Tests for /api/supplier route - Query Parameter Validation
 * 
 * Task 1.1: Add query parameter validation to `/api/supplier` route
 * Requirements: 5.4, 5.5
 */

import { GET } from './route';
import { NextResponse } from 'next/server';
jest.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));

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

    it('should accept "supplierTSRate" as a valid sortBy value', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=supplierTSRate',
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
          error: expect.stringContaining('Invalid sortBy'),
        }),
        expect.objectContaining({ status: 400 })
      );
    });

    it('should return 400 error with helpful message for invalid sortBy', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=unsupportedField',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          error: 'Invalid sortBy. Allowed: createdAt, updatedAt, supplierName, supplierTSRate',
        },
        { status: 400 }
      );
    });

    it('should default to supplier name when sortBy is not provided', async () => {
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
          error: expect.stringContaining('Invalid sortOrder'),
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
          error: 'Invalid sortOrder. Allowed: asc, desc',
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
        url: 'http://localhost/api/supplier?sortBy=supplierTSRate&sortOrder=asc',
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
          error: expect.stringContaining('Invalid sortBy'),
        }),
        { status: 400 }
      );
    });

    it('should work with search parameter alongside valid sort parameters', async () => {
      const request = {
        url: 'http://localhost/api/supplier?search=test&sortBy=supplierTSRate&sortOrder=desc',
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
    it('should use the default for an empty sortBy parameter', async () => {
      const response = await GET({ url: 'http://localhost/api/supplier?sortBy=' });
      expect(response.status).toBe(200);
      expect(response.data).toEqual([]);
    });

    it('should use the default for an empty sortOrder parameter', async () => {
      const response = await GET({ url: 'http://localhost/api/supplier?sortOrder=' });
      expect(response.status).toBe(200);
      expect(response.data).toEqual([]);
    });

    it('should be case-sensitive for sortBy parameter', async () => {
      const request = {
        url: 'http://localhost/api/supplier?sortBy=CreatedAt',
      };

      await GET(request);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid sortBy'),
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
          error: expect.stringContaining('Invalid sortOrder'),
        }),
        { status: 400 }
      );
    });
  });
});
