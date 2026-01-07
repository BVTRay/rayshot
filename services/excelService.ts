import * as XLSX from 'xlsx';
import { Episode, Scene } from '../types';

export const exportToExcel = (
  episodes: Episode[], 
  currentEpisodeId: string, 
  scope: 'single' | 'all',
  fileName: string = 'RayShot_Export.xlsx'
) => {
  const flatData: any[] = [];
  
  // Filter episodes based on scope
  const episodesToExport = scope === 'single' 
    ? episodes.filter(ep => ep.id === currentEpisodeId)
    : episodes;

  episodesToExport.forEach((episode) => {
    episode.scenes.forEach((scene) => {
      // Construct the formatted heading string: "INT. - LOCATION - DAY"
      const parts = [scene.intExt, scene.location, scene.time].filter(Boolean);
      const sceneHeading = parts.join(' - ');

      scene.shots.forEach((shot) => {
        const rowData: any = {};
        
        // Add Episode Column if exporting all
        if (scope === 'all') {
          rowData['Episode'] = episode.episodeNumber; // Or episode.title
        }

        // Standard Columns
        rowData['Scene'] = scene.sceneNumber;
        rowData['Shot'] = shot.shotNumber;
        rowData['Scene Heading'] = sceneHeading;
        rowData['Shot Description'] = shot.description;
        rowData['ERT'] = shot.ert;
        rowData['Shot Size'] = shot.size;       // Always Canonical
        rowData['Perspective'] = shot.perspective; // Always Canonical
        rowData['Movement'] = shot.movement;     // Always Canonical
        rowData['Equipment'] = shot.equipment;   // Always Canonical
        rowData['Focal Length'] = shot.focalLength; // Always Canonical
        rowData['Aspect Ratio'] = shot.aspectRatio;
        rowData['Notes'] = shot.notes;

        flatData.push(rowData);
      });
    });
  });

  const worksheet = XLSX.utils.json_to_sheet(flatData);
  
  // Set column widths
  const wscols = [];
  if (scope === 'all') wscols.push({ wch: 8 }); // Ep col
  
  wscols.push(
    { wch: 6 },  // Scene
    { wch: 6 },  // Shot
    { wch: 30 }, // Heading
    { wch: 50 }, // Description
    { wch: 10 }, // ERT
    { wch: 15 }, // Size
    { wch: 15 }, // Perspective
    { wch: 15 }, // Movement
    { wch: 15 }, // Equipment
    { wch: 20 }, // Focal Length
    { wch: 10 }, // Aspect
    { wch: 30 }  // Notes
  );
  
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  const sheetName = scope === 'single' ? 'Shot List' : 'Full Series Shot List';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  XLSX.writeFile(workbook, fileName);
};
