import rawpy
import os

source_dir = 'c:/Users/Promit/Desktop/photography'
dest_dir = 'c:/Users/Promit/Desktop/vibe coding/PersonalPortfolio/extracted_nefs'

os.makedirs(dest_dir, exist_ok=True)

html_content = "<html><body style='display:flex; flex-wrap:wrap;'>"

count = 0
for filename in os.listdir(source_dir):
    if filename.lower().endswith('.nef'):
        try:
            path = os.path.join(source_dir, filename)
            with rawpy.imread(path) as raw:
                thumb = raw.extract_thumb()
            if thumb.format == rawpy.ThumbFormat.JPEG:
                out_path = os.path.join(dest_dir, filename + '.jpg')
                with open(out_path, 'wb') as f:
                    f.write(thumb.data)
                
                # Add to HTML
                html_content += f"<div style='margin:10px; text-align:center;'><img src='file:///{out_path.replace(chr(92), '/')}' style='width:300px; height:auto; display:block;'><br><span>{filename}</span></div>"
                count += 1
                if count % 50 == 0:
                    print(f'Processed {count} files...')
        except Exception as e:
            print(f"Failed on {filename}: {e}")

html_content += "</body></html>"
with open("c:/Users/Promit/Desktop/vibe coding/PersonalPortfolio/scratch_nef_gallery.html", "w") as f:
    f.write(html_content)
print(f'Done processing {count} files.')
