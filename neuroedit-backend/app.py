from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from rembg import remove
from PIL import Image
import io
import os

app = FastAPI(title="NeuroEdit AI Backend")

# Allow CORS so your portfolio website can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, you'd put your portfolio URL here
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "online", "message": "NeuroEdit AI Backend is running!"}

@app.post("/api/remove-bg")
async def remove_background(image: UploadFile = File(...)):
    try:
        # Read the image sent from the frontend
        contents = await image.read()
        input_image = Image.open(io.BytesIO(contents))
        
        # Run the U2-Net AI model via rembg
        output_image = remove(input_image)
        
        # Save output to bytes
        img_byte_arr = io.BytesIO()
        output_image.save(img_byte_arr, format='PNG')
        img_byte_arr = img_byte_arr.getvalue()
        
        # Return the transparent PNG image
        return Response(content=img_byte_arr, media_type="image/png")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Hugging Face Spaces Docker uses port 7860 by default
    uvicorn.run(app, host="0.0.0.0", port=7860)
