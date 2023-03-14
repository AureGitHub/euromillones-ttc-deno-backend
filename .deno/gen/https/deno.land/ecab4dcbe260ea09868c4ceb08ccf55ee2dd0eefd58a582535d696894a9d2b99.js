export class ConnectionError extends Error {
    constructor(message){
        super(message);
        this.name = "ConnectionError";
    }
}
export class ConnectionParamsError extends Error {
    constructor(message, cause){
        super(message, {
            cause
        });
        this.name = "ConnectionParamsError";
    }
}
export class PostgresError extends Error {
    fields;
    constructor(fields){
        super(fields.message);
        this.fields = fields;
        this.name = "PostgresError";
    }
}
export class TransactionError extends Error {
    constructor(transaction_name, cause){
        super(`The transaction "${transaction_name}" has been aborted`, {
            cause
        });
        this.name = "TransactionError";
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcG9zdGdyZXNAdjAuMTcuMC9jbGllbnQvZXJyb3IudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdHlwZSBOb3RpY2UgfSBmcm9tIFwiLi4vY29ubmVjdGlvbi9tZXNzYWdlLnRzXCI7XG5cbmV4cG9ydCBjbGFzcyBDb25uZWN0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2U/OiBzdHJpbmcpIHtcbiAgICBzdXBlcihtZXNzYWdlKTtcbiAgICB0aGlzLm5hbWUgPSBcIkNvbm5lY3Rpb25FcnJvclwiO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBDb25uZWN0aW9uUGFyYW1zRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgY2F1c2U/OiBFcnJvcikge1xuICAgIHN1cGVyKG1lc3NhZ2UsIHsgY2F1c2UgfSk7XG4gICAgdGhpcy5uYW1lID0gXCJDb25uZWN0aW9uUGFyYW1zRXJyb3JcIjtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgUG9zdGdyZXNFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgcHVibGljIGZpZWxkczogTm90aWNlO1xuXG4gIGNvbnN0cnVjdG9yKGZpZWxkczogTm90aWNlKSB7XG4gICAgc3VwZXIoZmllbGRzLm1lc3NhZ2UpO1xuICAgIHRoaXMuZmllbGRzID0gZmllbGRzO1xuICAgIHRoaXMubmFtZSA9IFwiUG9zdGdyZXNFcnJvclwiO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBUcmFuc2FjdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihcbiAgICB0cmFuc2FjdGlvbl9uYW1lOiBzdHJpbmcsXG4gICAgY2F1c2U6IFBvc3RncmVzRXJyb3IsXG4gICkge1xuICAgIHN1cGVyKFxuICAgICAgYFRoZSB0cmFuc2FjdGlvbiBcIiR7dHJhbnNhY3Rpb25fbmFtZX1cIiBoYXMgYmVlbiBhYm9ydGVkYCxcbiAgICAgIHsgY2F1c2UgfSxcbiAgICApO1xuICAgIHRoaXMubmFtZSA9IFwiVHJhbnNhY3Rpb25FcnJvclwiO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxNQUFNLHdCQUF3QjtJQUNuQyxZQUFZLE9BQWdCLENBQUU7UUFDNUIsS0FBSyxDQUFDO1FBQ04sSUFBSSxDQUFDLElBQUksR0FBRztJQUNkO0FBQ0YsQ0FBQztBQUVELE9BQU8sTUFBTSw4QkFBOEI7SUFDekMsWUFBWSxPQUFlLEVBQUUsS0FBYSxDQUFFO1FBQzFDLEtBQUssQ0FBQyxTQUFTO1lBQUU7UUFBTTtRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHO0lBQ2Q7QUFDRixDQUFDO0FBRUQsT0FBTyxNQUFNLHNCQUFzQjtJQUMxQixPQUFlO0lBRXRCLFlBQVksTUFBYyxDQUFFO1FBQzFCLEtBQUssQ0FBQyxPQUFPLE9BQU87UUFDcEIsSUFBSSxDQUFDLE1BQU0sR0FBRztRQUNkLElBQUksQ0FBQyxJQUFJLEdBQUc7SUFDZDtBQUNGLENBQUM7QUFFRCxPQUFPLE1BQU0seUJBQXlCO0lBQ3BDLFlBQ0UsZ0JBQXdCLEVBQ3hCLEtBQW9CLENBQ3BCO1FBQ0EsS0FBSyxDQUNILENBQUMsaUJBQWlCLEVBQUUsaUJBQWlCLGtCQUFrQixDQUFDLEVBQ3hEO1lBQUU7UUFBTTtRQUVWLElBQUksQ0FBQyxJQUFJLEdBQUc7SUFDZDtBQUNGLENBQUMifQ==