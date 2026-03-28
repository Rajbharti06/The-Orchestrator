from fastapi import FastAPI
app = FastAPI()
# jwt bcrypt
@app.get("/")
def read_root(): return {"Hello": "World"}