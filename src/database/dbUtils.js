export const buildQuery = (baseQuery, params) => {
    let query = baseQuery;
    let queryParams = [];
  
    if (Object.keys(params).length > 0) {
      let conditions = [];
      Object.entries(params).forEach(([key, value]) => {
        if (value === null) {
          conditions.push(`${key} IS NULL`);
        } else {
          conditions.push(`${key} = ?`);
          queryParams.push(value);
        }
      });
      query += " WHERE " + conditions.join(" AND ");
    }
  
    return { query, queryParams };
  };
  