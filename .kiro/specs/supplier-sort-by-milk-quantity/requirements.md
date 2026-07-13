# Requirements Document

## Introduction

This feature enables sorting suppliers by the total milk quantity they have provided through procurement records. This helps identify top-performing suppliers and analyze supplier contributions to milk procurement operations.

## Glossary

- **Supplier_System**: The supplier management component that displays and manages supplier information
- **Procurement_Service**: The backend service that stores and retrieves milk procurement records
- **Total_Milk_Quantity**: The sum of all milkQuantity values across all procurement records for a given supplier
- **Sort_Order**: The direction of sorting, either ascending (lowest to highest) or descending (highest to lowest)

## Requirements

### Requirement 1: Calculate Total Milk Quantity Per Supplier

**User Story:** As a dairy manager, I want the system to calculate total milk quantity provided by each supplier, so that I can identify high-volume suppliers.

#### Acceptance Criteria

1. THE Procurement_Service SHALL aggregate all procurement records by supplierId
2. FOR each supplier, THE Procurement_Service SHALL sum the milkQuantity field across all procurement records
3. WHEN a supplier has no procurement records, THE Procurement_Service SHALL return a Total_Milk_Quantity of zero
4. THE Procurement_Service SHALL include suppliers with zero Total_Milk_Quantity in the results

### Requirement 2: Sort Suppliers by Total Milk Quantity

**User Story:** As a dairy manager, I want to sort suppliers by total milk quantity, so that I can quickly identify top suppliers.

#### Acceptance Criteria

1. THE Supplier_System SHALL provide a sort option for Total_Milk_Quantity
2. WHEN the user selects Total_Milk_Quantity sort in descending order, THE Supplier_System SHALL display suppliers from highest to lowest Total_Milk_Quantity
3. WHEN the user selects Total_Milk_Quantity sort in ascending order, THE Supplier_System SHALL display suppliers from lowest to highest Total_Milk_Quantity
4. WHEN multiple suppliers have the same Total_Milk_Quantity, THE Supplier_System SHALL maintain their relative order from the original createdAt sort
5. THE Supplier_System SHALL preserve search filter results when applying Total_Milk_Quantity sort

### Requirement 3: Display Total Milk Quantity

**User Story:** As a dairy manager, I want to see the total milk quantity for each supplier, so that I can assess supplier performance at a glance.

#### Acceptance Criteria

1. THE Supplier_System SHALL display Total_Milk_Quantity for each supplier in the supplier table
2. THE Supplier_System SHALL format Total_Milk_Quantity with appropriate units (liters)
3. WHEN Total_Milk_Quantity is zero, THE Supplier_System SHALL display "0 L" or equivalent
4. THE Supplier_System SHALL display Total_Milk_Quantity with up to two decimal places

### Requirement 4: Performance and Scalability

**User Story:** As a system administrator, I want supplier sorting to perform efficiently, so that users experience fast response times.

#### Acceptance Criteria

1. WHEN the supplier list contains up to 1000 suppliers, THE Procurement_Service SHALL return sorted results within 2 seconds
2. THE Procurement_Service SHALL use database aggregation to calculate Total_Milk_Quantity rather than client-side computation
3. WHEN procurement records are updated, THE Supplier_System SHALL reflect updated Total_Milk_Quantity values on the next data fetch
4. THE Procurement_Service SHALL maintain consistent sort results for the same dataset within a single request

### Requirement 5: API Sort Parameter

**User Story:** As a frontend developer, I want a standardized API parameter for sorting, so that I can implement consistent sorting behavior.

#### Acceptance Criteria

1. THE Procurement_Service SHALL accept a "sortBy" query parameter with value "totalMilkQuantity"
2. THE Procurement_Service SHALL accept a "sortOrder" query parameter with values "asc" or "desc"
3. WHEN "sortBy" is "totalMilkQuantity" and "sortOrder" is omitted, THE Procurement_Service SHALL default to "desc"
4. WHEN "sortBy" parameter is invalid or missing, THE Procurement_Service SHALL default to sorting by createdAt descending
5. THE Procurement_Service SHALL return an error response with status 400 WHEN "sortOrder" contains invalid values

### Requirement 6: Data Integrity

**User Story:** As a dairy manager, I want accurate milk quantity calculations, so that I can make reliable business decisions.

#### Acceptance Criteria

1. THE Procurement_Service SHALL include only procurement records with valid supplierId references when calculating Total_Milk_Quantity
2. THE Procurement_Service SHALL treat null or undefined milkQuantity values as zero in aggregation
3. THE Procurement_Service SHALL exclude deleted procurement records from Total_Milk_Quantity calculations
4. FOR ALL suppliers with procurement records, THE sum of individual milkQuantity values SHALL equal the displayed Total_Milk_Quantity
