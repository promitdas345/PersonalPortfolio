FROM python:3.9-slim

WORKDIR /code

COPY ./requirements.txt /code/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Download the u2net model to cache it during the build process
RUN python -c "from rembg import new_session; new_session('u2net')"

COPY . .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
