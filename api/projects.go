// Fonction Vercel : ce fichier devient automatiquement la route /api/projects.
package handler

import (
	"net/http"

	"github.com/3-14XL/Portefolio-CV/projects"
)

// Handler est la fonction appelée par Vercel pour /api/projects.
func Handler(w http.ResponseWriter, r *http.Request) {
	projects.Handler(w, r)
}
