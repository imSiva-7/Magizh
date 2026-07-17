# CommonTable Component - Usage Examples

## Basic Usage

```jsx
import CommonTable from "@/src/components/CommonTable";

const columns = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
];

const data = [
  { id: 1, name: "John Doe", email: "john@example.com", status: "Active" },
  { id: 2, name: "Jane Smith", email: "jane@example.com", status: "Inactive" },
];

<CommonTable columns={columns} data={data} />
```

## With Custom Rendering

```jsx
const columns = [
  {
    key: "name",
    label: "Name",
    render: (row) => <strong>{row.name}</strong>,
  },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <span className={row.status === "Active" ? "green" : "red"}>
        {row.status}
      </span>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    render: (row) => (
      <button onClick={() => handleEdit(row.id)}>Edit</button>
    ),
  },
];

<CommonTable 
  columns={columns} 
  data={data} 
  onRowClick={(row) => console.log(row)}
/>
```

## With Loading State

```jsx
const [loading, setLoading] = useState(true);
const [data, setData] = useState([]);

<CommonTable 
  columns={columns} 
  data={data} 
  loading={loading}
  emptyMessage="No records found"
/>
```

## With Custom Column Width

```jsx
const columns = [
  { key: "id", label: "ID", width: "80px" },
  { key: "name", label: "Name", width: "200px" },
  { key: "description", label: "Description" }, // Auto width
];

<CommonTable columns={columns} data={data} />
```

## With Custom Styling

```jsx
const columns = [
  {
    key: "name",
    label: "Name",
    headerClassName: "customHeaderClass",
    cellClassName: "customCellClass",
  },
];

<CommonTable 
  columns={columns} 
  data={data}
  tableClassName="myCustomTable"
  striped={false}
/>
```

## Full Featured Example

```jsx
const StockTable = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const columns = [
    {
      key: "product",
      label: "Product",
      render: (row) => <div className="font-bold">{row.product}</div>,
    },
    {
      key: "quantity",
      label: "Quantity",
      render: (row) => (
        <span className={row.quantity < 10 ? "text-red" : ""}>
          {row.quantity}
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      render: (row) => `₹${row.price.toFixed(2)}`,
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div>
          <button onClick={() => handleEdit(row)}>Edit</button>
          <button onClick={() => handleDelete(row.id)}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <CommonTable
      columns={columns}
      data={data}
      loading={loading}
      emptyMessage="No stock items available"
      onRowClick={(row) => console.log("Row clicked:", row)}
      striped={true}
    />
  );
};
```

## Props Reference

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| columns | Array | [] | Array of column definitions |
| data | Array | [] | Array of data rows |
| loading | Boolean | false | Show loading spinner |
| emptyMessage | String | "No data available" | Message when no data |
| onRowClick | Function | undefined | Row click handler |
| striped | Boolean | true | Enable striped rows |
| tableClassName | String | "" | Additional table CSS class |

## Column Definition

| Property | Type | Description |
|----------|------|-------------|
| key | String | Data key to display |
| label | String | Column header label |
| render | Function | Custom render function (row, index) => JSX |
| width | String | Column width (e.g., "100px", "20%") |
| headerClassName | String | Custom header class |
| cellClassName | String | Custom cell class |
