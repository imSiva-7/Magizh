# Implementation Plan: Supplier Sort by Milk Quantity

## Overview

This implementation adds supplier sorting by total milk quantity through three main areas: backend API enhancement with MongoDB aggregation, frontend UI updates with sort controls, and proper error handling. The approach leverages database-level aggregation for performance and maintains compatibility with existing search functionality.

## Tasks

- [ ] 1. Implement backend aggregation and API enhancements
  - [x] 1.1 Add query parameter validation to `/api/supplier` route
    - Add validation for `sortBy` parameter (allowed values: "createdAt", "totalMilkQuantity")
    - Add validation for `sortOrder` parameter (allowed values: "asc", "desc")
    - Return 400 error response for invalid parameter values
    - _Requirements: 5.4, 5.5_

  - [ ] 1.2 Implement MongoDB aggregation pipeline for total milk quantity calculation
    - Create aggregation pipeline starting from suppliers collection
    - Add `$lookup` stage to join with procurements collection
    - Add `$group` stage within lookup pipeline to sum milkQuantity by supplierId
    - Add `$addFields` stage to include totalMilkQuantity with default value of 0
    - Handle null/undefined milkQuantity values as 0 in aggregation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.2_

  - [ ] 1.3 Integrate search filtering with aggregation pipeline
    - Add conditional `$match` stage at the beginning of pipeline when search parameter is provided
    - Support regex matching on supplierName, supplierType, and supplierNumber fields
    - Ensure case-insensitive search
    - _Requirements: 2.5_

  - [ ] 1.4 Implement dynamic sorting in aggregation pipeline
    - Build sort specification object based on sortBy and sortOrder parameters
    - Add secondary sort by createdAt descending when sorting by totalMilkQuantity
    - Default to createdAt descending when sortBy is invalid or missing
    - Default to descending order for totalMilkQuantity when sortOrder is omitted
    - Add `$sort` stage to aggregation pipeline
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.4, 5.3, 5.4_

  - [ ] 1.5 Add error handling for database operations
    - Wrap aggregation execution in try-catch block
    - Return 500 status with generic error message for database failures
    - Log detailed error information for debugging
    - Ensure single supplier fetch (by supplierId) remains unchanged
    - _Requirements: 4.2_

- [ ] 2. Checkpoint - Backend API validation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement frontend UI components and state management
  - [ ] 3.1 Add sort state management to supplier page
    - Add `sortBy` state variable with default value "createdAt"
    - Add `sortOrder` state variable with default value "desc"
    - Create state setter functions for both variables
    - _Requirements: 2.1, 5.3_

  - [ ] 3.2 Modify fetchData function to include sort parameters
    - Update fetchData to include sortBy and sortOrder in URLSearchParams
    - Add sortBy and sortOrder to useCallback dependencies
    - Ensure fetchData is called when sort parameters change
    - Add error handling for non-ok HTTP responses
    - Display toast notification on fetch errors
    - _Requirements: 2.1, 4.3_

  - [ ] 3.3 Create sort controls UI component
    - Add sort section container with label, select dropdown, and sort order button
    - Create select dropdown with options for "Date Created" and "Total Milk Quantity"
    - Add onChange handler to update sortBy state
    - Default to descending order when "Total Milk Quantity" is selected
    - Create sort order toggle button with up/down arrow icons
    - Disable controls when loading state is true
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.4 Add total milk quantity column to supplier table
    - Add "Total Milk" header cell to table header row
    - Add table data cell in each row to display totalMilkQuantity
    - Position column between "TS Rate" and "Phone"
    - _Requirements: 3.1_

  - [ ] 3.5 Implement milk quantity formatting function
    - Create formatMilkQuantity helper function
    - Handle undefined and null values by returning "0 L"
    - Parse value to float and validate
    - Format number with exactly 2 decimal places
    - Append " L" unit suffix
    - Apply formatting function to totalMilkQuantity in table cells
    - _Requirements: 3.2, 3.3, 3.4_

- [ ] 4. Add CSS styling for new UI elements
  - [ ] 4.1 Create styles for sort controls
    - Add `.sortSection` class with flexbox layout and spacing
    - Add `.sortSelect` class for dropdown styling
    - Add `.sortOrderButton` class with hover and disabled states
    - Add `.milkQuantityCell` class with right alignment and color
    - Ensure responsive design and accessibility
    - _Requirements: 3.1_

- [ ] 5. Checkpoint - Integration testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All implementation tasks reference specific granular requirements for traceability
- Backend aggregation uses MongoDB's native capabilities for optimal performance per Requirement 4.2
- Search filtering is preserved when applying sort per Requirement 2.5
- Secondary sorting by createdAt ensures stable ordering for ties per Requirement 2.4
- Error handling ensures graceful degradation and user-friendly messages
- The implementation maintains backward compatibility with existing supplier CRUD operations
- Total milk quantity calculation includes only valid procurement records per Requirement 6.1

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 4, "tasks": ["3.4", "3.5"] }
  ]
}
```
