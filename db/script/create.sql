CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL,
    observacion VARCHAR(50) NOT NULL,
    is_finalizada BOOLEAN,
    registration_date TIMESTAMP
)